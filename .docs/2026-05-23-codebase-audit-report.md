# SiteOps — Full Codebase Audit Report

**Date:** 2026-05-23
**Scope:** Every tracked source file (~217) — config, middleware, auth, DB layer, all API routes, services, frontend components/pages, migrations, PWA service worker.
**Goal:** Catalog issues across security, authorization, DB/performance, error handling, edge cases / race conditions, correctness, native-mobile feel, and code health — with concrete suggested fixes.

---

## Severity legend

| Tag | Meaning |
|-----|---------|
| **CRITICAL** | Broken feature or exploitable; fix before next release. |
| **HIGH** | Wrong behavior, data risk, or broken tooling; fix soon. |
| **MEDIUM** | Real defect or notable gap; schedule it. |
| **LOW** | Polish, hardening, doc rot, or minor perf. |

---

## Executive summary

The backend is well-structured: a consistent `withApi` wrapper, request IDs, structured logging, Zod validation, a duplicate-guard service, Redis caching with invalidation, and a JWT-claim-based auth path that avoids per-request DB lookups. Good foundation.

But there are **two release-blocking problems**:

1. **Custom-category log entries are broken end-to-end** (B1) — the form posts a payload shape the `/api/entries/dynamic` endpoint rejects.
2. **A large set of CSS classes referenced by ~12 app pages + error boundaries no longer exist** (B2) — those screens render with browser-default typography and missing colors. This is fallout from the "Completely revamped UI" commit, which left the old Material-3 design tokens behind.

Beyond those: the transfers API has an authorization gap and missing validation, the `db:audit` script is broken, the Drizzle schema has drifted from the actual DB indexes, and all 15 `components/views/*` files are dead code.

Findings are grouped by theme. Each has a severity tag and a suggested fix.

---

## 1. Security

### S1 — Transfer creation has no ownership check — **HIGH**
`app/api/transfers/route.ts` `POST` lets any Supervisor create a transfer with **any** `fromSiteId`, including sites they do not supervise. There is no `checkOwnership` call and no validation that the site exists. The `transfers/new` page (`app/app/transfers/new/page.tsx`) also lists **every** non-archived site in the system for both `fromSite` and `toSite`.

Also in the same handler:
- No Zod schema — manual `String(...)`/`Number(...)` coercion.
- `resourceType` is narrowed to `"Labour" | "Materials"` but the DB enum is `Labour | Materials | Money | Machinery` — Money/Machinery transfers are impossible.
- No `fromSiteId !== toSiteId` check — a site can transfer to itself.
- No `handleDbError` — a bad site UUID throws an FK violation that surfaces as a generic `500 INTERNAL_ERROR`.

**Fix:** Add a Zod schema for the body. Verify `fromSiteId` exists and `checkOwnership(session.user, fromSite.supervisorId)` passes. Reject `fromSiteId === toSiteId`. Verify `toSiteId` exists. Wrap the insert in `try/catch` with `handleDbError`. Restrict the site list on the page to sites the supervisor owns (for `fromSite`).

### S2 — Transfer review is not idempotent and has no effect — **MEDIUM**
`app/api/transfers/[id]/route.ts` `PATCH`:
- No status guard — an admin can flip a transfer `Approved → Declined → Approved` repeatedly; each call overwrites `approvedByUserId`/`reviewedAt`.
- No `handleDbError`.
- No notification to the requester (unlike resource requests).
- Approving a transfer does **not** move any resource — it only flips a status row. If transfers are meant to adjust site inventory/entries, that logic is missing entirely.

**Fix:** Mirror `reviewResourceRequest` — only transition from `Pending`, return `409 CONFLICT` otherwise; use a conditional `UPDATE ... WHERE status='Pending'` for the race. Add `handleDbError`. Add a requester notification. Decide and implement (or explicitly document as out-of-scope) what "approved" does to inventory.

### S3 — No Row Level Security on application tables — **MEDIUM**
Migration `0006` disabled/dropped RLS on the old Better-Auth tables; the new domain tables (`sites`, `*_entries`, `notifications`, …) never had RLS enabled. All access control lives in the Next.js layer (middleware headers + `requireRole` guards). The runtime DB connection uses `DATABASE_URL` through the Supabase pooler as a privileged role, so RLS would not even apply on that path.

This is acceptable *only* as long as the DB credentials are never exposed to a client and every data path goes through the API. It removes the database as a backstop — one missing `checkOwnership` (see S1) becomes a full data leak.

**Fix:** As defense-in-depth, enable RLS and add policies keyed on `supervisor_id`/`created_by`, and have the app connect as a non-superuser role that respects them. At minimum, document explicitly that the app is the sole gatekeeper and treat every route's auth check as security-critical.

### S4 — CSP is still report-only and permissive — **LOW**
`next.config.ts` ships `Content-Security-Policy-Report-Only` with `script-src 'self' 'unsafe-inline' 'unsafe-eval'`. The comment says "promote in a follow-up." Until enforced, CSP provides no protection.

**Fix:** Triage report-only violations, drop `unsafe-eval` (Next 15 should not need it in prod), move to nonce-based `script-src`, then flip the header name to `Content-Security-Policy`.

### S5 — SSE live-feed route has no duration cap — **LOW**
`app/api/admin/live-feed-sse/route.ts` opens a `ReadableStream` with a 2s `setInterval` and only stops on client `abort`. No `maxDuration` export. On a serverless host the function may run until the platform hard-limit, and a dropped connection that does not fire `abort` leaks an interval.

**Fix:** Add `export const maxDuration = ...`, send periodic heartbeats, and self-close after a bounded window so the client reconnects. Note: this route and the long-poll `live-feed` route are redundant (see D12) — keep one.

---

## 2. Authorization / correctness of access checks

### A1 — Entry edit/delete ignores parent-site state — **MEDIUM**
`app/api/entries/[id]/route.ts` `PATCH`/`DELETE` check ownership against the entry's `createdBy` only. They never re-check that the entry's site is still non-archived or that the editor still has access to that site. A supervisor can edit/delete their old entry on a site that has since been reassigned or archived.

**Fix:** Load the entry's site, reject if `archivedAt` is set, and (optionally) require current site access in addition to entry ownership.

### A2 — Dynamic entry value not validated against field type — **MEDIUM**
`app/api/entries/dynamic/route.ts` validates `value` against `options` only when `fieldType === "Dropdown"`. A `Number` field happily stores an arbitrary string into the `jsonb` `value` column, which can later break analytics or rendering.

**Fix:** Switch on `def.fieldType`: require `typeof value === "number"` for `Number`, `string` for `Text`, and option membership for `Dropdown`.

### A3 — Missing role claim silently downgrades to Supervisor — **LOW**
`getSessionUserFromHeaders` defaults a missing role header to `"Supervisor"`. Middleware deletes the role header when the JWT lacks the `user_role` claim. So an Admin whose profile row was created *after* their current token was minted is treated as a Supervisor until they re-login. Documented as a JWT-TTL tradeoff, but it fails closed in a way that is hard to diagnose.

**Fix:** On a missing role claim for an authenticated user, log a warning with the user id so it is observable; consider a one-time server-side profile lookup fallback for that case.

---

## 3. Database & performance

### D1 — `db:audit` script is broken (type-mismatch join) — **HIGH**
`lib/db/audit.ts` joins `sites.id` (integer PK) to `*_entries.site_id` (uuid):
```sql
left join sites s on s.id = e.site_id
```
Postgres rejects `integer = uuid` (`operator does not exist`). Every orphan check that uses this join fails — `npm run db:audit` errors out.

**Fix:** Join on the uuid: `left join sites s on s.site_id = e.site_id` and test for `s.site_id is null`. Same correction for the labour/material/machinery/expense/incident blocks.

### D2 — Drizzle schema has drifted from the live DB — **HIGH**
Indexes created by raw SQL migrations (`0002_production_hardening.sql`, `0004`, `0007`) — e.g. `labour_entries_created_at_idx`, `sites_archived_at_idx`, `*_created_by_idx`, the unique `field_definitions_subcategory_label_uidx`, `resource_requests_site_status_created_idx` — are **not declared** in `lib/db/schema.ts`. The next `drizzle-kit generate` will diff schema-vs-DB and emit `DROP INDEX` statements for all of them, silently removing performance indexes.

**Fix:** Reconcile `lib/db/schema.ts` so it declares every index/constraint that actually exists in the DB. Then run `drizzle-kit generate` and confirm it produces an empty diff. Make schema.ts the single source of truth and stop hand-writing index migrations.

### D3 — Site detail over-fetches 5× — **MEDIUM**
`getEntriesBySite(siteId, "all", …)` runs 5 queries, each `SELECT *` with `LIMIT 50` → up to 250 rows pulled and serialized into the RSC payload, while `SiteDetailPageClient` renders only **3 rows per group** in the grouped view.

**Fix:** For the grouped/initial view, fetch `LIMIT 3` (or 5) per type. Fetch the full 50 only when the user selects a single type. Or do one `UNION ALL` query with a per-type window.

### D4 — Incident date filter excludes same-day entries — **MEDIUM**
In `getEntriesBySite`, incident filtering uses `dateWhere(incidentReports.createdAt)` — `createdAt` is a `timestamp`, but `from`/`to` are `YYYY-MM-DD` strings. `lte(createdAt, '2026-05-23')` compares against `2026-05-23 00:00:00`, so any incident logged later on the 23rd is dropped from a range ending on the 23rd.

**Fix:** Cast `createdAt::date` for the comparison, or build an exclusive upper bound (`< to + 1 day`). Incidents have no `date` column — consider adding one for consistency with the other entry tables.

### D5 — `SELECT *` everywhere leaks internal ids and bloats payloads — **MEDIUM**
`db.select().from(sites)`, entries, `resource_transfers`, `resource_requests`, `categories`, custom-type catalogs all select every column — including the internal integer `id` and audit columns (`createdByUserId`, `updatedByUserId`). The integer `id` exposes the auto-increment sequence (the live-feed query deliberately avoids this; the list endpoints do not).

**Fix:** Select explicit column lists, omitting internal `id` and unused audit columns. Smaller responses, no sequence leak, stable API shape.

### D6 — `count(*)` typed as number but returned as string — **MEDIUM**
`getNotificationCountForUser` selects `sql<number>\`count(*)\``. postgres-js returns `bigint` as a **string**. `result[0]?.count ?? 0` does not coerce a string, so `total` in the notifications response is `"7"`, not `7`. Same pattern risk anywhere `count(*)`/`sum()` is used (`getSiteTotalExpenses` returns a string by design, which is at least consistent).

**Fix:** Use `count(*)::int` (or `::bigint` then `Number(...)`) and coerce in JS: `Number(result[0]?.count ?? 0)`.

### D7 — Overlapping indexes on entry tables — **MEDIUM**
For `labour_entries`, `schema.ts` declares both `labour_entries_site_id_date_idx (site_id, date)` and `labour_entries_site_date_created_idx (site_id, date desc, created_at desc)`, while migration `0002` adds `labour_entries_site_date_idx (site_id, date desc)`. Three indexes on near-identical leading columns → write amplification and wasted storage on every insert. Same pattern repeats for material/machinery/expense.

**Fix:** Keep the most selective composite (`site_id, date desc, created_at desc`) — it serves the `ORDER BY date desc, created_at desc` queries and prefix-matches `(site_id)` and `(site_id, date)` lookups. Drop the redundant two per table.

### D8 — Unbounded list endpoints — **LOW**
Admin `GET` on `resource_requests`, `field_requests`, and the catalog `GET`s (`customLabourTypes`, `customUnits`, `unitMaster`, `categories`) have no `LIMIT`/pagination. They are full table scans that grow without bound.

**Fix:** Add `limit`/`offset` (the notifications endpoint is a good template) and a sane default cap.

### D9 — `resource_transfers` admin list is an unbounded scan with no index — **LOW**
`transfers` `GET` (admin) does `SELECT * FROM resource_transfers ORDER BY created_at DESC` with no limit. There is no index on `created_at`.

**Fix:** Paginate, and add an index on `created_at` (or `status, created_at`).

### D10 — Case-variant category duplicates can slip through — **LOW**
`categories.name` has a **case-sensitive** unique constraint; `categories_name_lower_idx` is a plain (non-unique) index. The app dedupes case-insensitively in code (`normalizeLabel`), but under concurrency two requests for "Steel" and "steel" both pass the read-then-check and both insert.

**Fix:** Make the lower-case index `UNIQUE` (`CREATE UNIQUE INDEX … ON categories (lower(name))`) and let `handleDbError` turn the 23505 into a clean 409. Same idea for `subcategories` per category.

### D11 — Connection pool sizing on serverless — **LOW**
`lib/db/client.ts` sets `max: 5` per instance. On a serverless host, N concurrent lambda instances each open up to 5 → 5N connections against the Supabase pooler. Fine at low traffic; monitor.

**Fix:** Keep `max` low (2–3) for serverless, or confirm the Supabase pooler limit comfortably exceeds peak `5 × instances`.

### D12 — Two live-feed implementations; long-poll holds an invocation 25s — **LOW/PERF**
`app/api/admin/live-feed/route.ts` long-polls (sleeps up to 25s holding a serverless invocation per connected admin). `app/api/admin/live-feed-sse/route.ts` does the same job with SSE. Both poll all 5 entry tables every 2s.

**Fix:** Pick one transport. For a real-time feed, prefer Supabase Realtime (Postgres logical replication) over polling — it removes the held invocations and the per-poll 5-table `UNION` scan.

---

## 4. Error handling

### E1 — Transfer routes lack `handleDbError` — **MEDIUM**
See S1/S2. FK violations from bad site UUIDs become opaque `500`s instead of `409`/`404`. Every other mutating route wraps inserts in `try/catch` + `handleDbError`; transfers are the exception.

**Fix:** Add the same pattern to both transfer handlers.

### E2 — Bad dynamic-entry values stored unchecked — **MEDIUM**
See A2 — non-conforming values land in `jsonb` and fail later instead of at the boundary.

### E3 — `requestJson` mislabels genuine 404s as "endpoint unavailable" — **LOW**
`lib/http/client.ts` treats any `404`/`405` whose body lacks `error.code === 'NOT_FOUND'` as `kind: 'endpoint_unavailable'`, which the UI renders as an offline/"endpoint not on this build" banner. A real missing resource that returns a bare 404 triggers the wrong, alarming banner.

**Fix:** Rely on the API contract — the API always returns a structured error body with a `code`. Treat `endpoint_unavailable` only when the body is *not* the standard error envelope (e.g. an HTML 404), and treat a structured `NOT_FOUND` as a normal not-found.

### E4 — `getOrSetJson` can run `compute()` twice on a partial cache failure — **LOW**
If `redis.get` succeeds (miss) but `redis.set` throws, the `catch` block runs `compute()` again. Minor wasted work.

**Fix:** Move only the `get` into the guarded path, or set the cache in a fire-and-forget `.catch()` after returning the computed value.

### E5 — Logs are unstructured-sink with no scrubbing — **LOW**
`lib/logging/log.ts` writes JSON to `console`. Some contexts include user email. No level filtering, no redaction.

**Fix:** Add a redaction step for email/PII in log context, and gate `logInfo` volume in production.

---

## 5. Edge cases & race conditions

### R1 — Duplicate-check-then-insert is not atomic — **MEDIUM**
`categories`, `subcategories`, `customLabourTypes`, `customUnits` POST handlers read existing rows, check for duplicates in JS, then insert. No transaction, and the custom-type tables have **no unique constraint at all**. Concurrent identical requests create true duplicates.

**Fix:** Add unique constraints (`lower(name)`, scoped to category where relevant) and let the DB be the arbiter — catch `23505` via `handleDbError` and return the existing row or a 409.

### R2 — `sites/[id]` GET fetches the row before authorizing — **MEDIUM**
The route runs `getOrSetJson(siteCacheKey(id), …)` in `Promise.all` *alongside* `requireSiteAccess`. The site row is fetched and cached even when auth fails. Not a data leak (the response is still gated), but it does wasted work and caches on behalf of unauthorized callers.

**Fix:** Await auth first, then the cached fetch — or accept it as a deliberate latency optimization and document it.

### R3 — Field-request "merge target" is accepted but never applied — **MEDIUM**
`reviewFieldRequest` takes `mergeTargetCategoryId`/`mergeTargetSubcategoryId` and only uses them to *gate* a decline (they must be present). No merge is performed. Declining a `[Category Review]` duplicate just sets `status = Declined` and leaves the duplicate category in place.

**Fix:** Implement the merge — repoint references from the duplicate to the target and delete/archive the duplicate — inside a transaction; or remove the merge-target parameters and the misleading UI if merge is not in scope.

### R4 — Live-feed `created_at > since` can skip rows — **LOW**
`getActivitySince` uses a strict `>`. Two rows with the exact same `created_at` straddling a poll boundary: the second is missed because `since` advances past it.

**Fix:** Track `(created_at, id)` as the cursor and use a tuple comparison, or use `>=` plus client-side dedupe on `id`.

### R5 — Budget alert re-notifies on every expense past 80% — **LOW**
`entries/expenses` fires `notifyBudgetThreshold` whenever `totalSpend / budget >= 0.8`. There is no "already alerted" flag, so every subsequent expense spams all admins + the supervisor.

**Fix:** Record the last-alerted threshold on the site (e.g. `budget_alert_at` or a crossed-threshold marker) and only notify on an *upward* crossing of a band (80%, 100%).

---

## 6. Correctness bugs

### B1 — Custom-category log entries are broken end-to-end — **CRITICAL**
For any category not in the registry (`labour|material|machinery|expense|incident`), `entryFieldRegistry.resolveEntryKind` returns `"dynamic"` and `resolveEntryFields` returns `fallbackFields` = `{date, name, quantity, remarks}`. `EntryForm.buildPayload` posts that object to `/api/entries/dynamic`. But `dynamicEntrySchema` requires `{ siteId, date, fieldDefinitionId, value }`. The payloads never match → every custom-category submission fails validation with a 400.

**Fix:** Make `EntryForm` build a dynamic payload when `kind === "dynamic"`: one request per field definition (`fieldDefinitionId` + `value`), or a batched endpoint. The dynamic form must be driven by the category's actual `fieldDefinitions` (from the category tree), not by `fallbackFields`. Also wire up delete for dynamic entries (currently `handleDelete` early-returns for `dynamic`).

### B2 — ~12 pages reference CSS classes that no longer exist — **CRITICAL (visual)**
After the UI revamp, `globals.css` defines a Tailwind-v4 `@theme` with utility classes plus a few component classes. But these are still referenced and are **undefined**:

- Typography: `font-headline*`, `text-headline*`, `font-body*`, `text-body*`, `font-label*`, `text-label*`
- Layout: `industrial-grid`
- Colors: `error-container`, `on-error`, `on-error-container`, `on-background`, `surface-tint`

Tailwind v4 silently drops unknown utilities, so the elements render with **browser-default font size/weight and missing background/text colors**. Affected (from grep):
`app/app/error.tsx`, `app/app/sites/[id]/error.tsx`, `app/app/profile/page.tsx`, `app/app/notifications/page.tsx`, `app/app/admin/{analytics,approvals,expenses,live-feed}/page.tsx`, `app/app/requests/{field,resource}/page.tsx`, `app/app/transfers/new/page.tsx`, `app/app/sites/new/SitesNewPageClient.tsx`, `components/logs/EntryCard.tsx`, `components/logs/SubcategoryCombobox.tsx`.

The error boundaries are the worst case — when the app crashes, the fallback UI itself is unstyled.

**Fix:** Choose one:
- (a) Re-add the missing tokens to `@theme` — define `--text-headline-sm` etc. and the `error-container`/`on-*` colors — so the legacy classes resolve; **or**
- (b) Migrate the affected pages/components to the new utility style used by `DashboardPageClient`, `AppHeader`, `AppShell`.
Option (a) is faster and lower-risk. Then grep the repo to confirm zero remaining undefined tokens.

### B3 — Profile name never displays — **MEDIUM**
`app/app/profile/page.tsx` renders `user?.name`, but `/api/users/me` returns `user: auth.session.user`, which is `{ id, email, role }` — there is no `name`. The header on the profile card is always "—".

**Fix:** Either drop the name field, or source a display name (Supabase `user_metadata.full_name` via the server client, or add a `name` column to `user_profiles`) and include it in the `/api/users/me` response.

### B4 — Material "Unit" field shows material subcategories, not units — **MEDIUM**
`entryFieldRegistry` models `unit` as a `subcategory` field. `EntryForm` renders it with `SubcategoryCombobox` using the **same** `categoryId` as `materialType`. So the Unit dropdown lists the material category's subcategories and lets users create subcategories named like units. The real `unit_master` / `custom_units` catalog (and the `/api/catalog/units/*` endpoints) is never used by the form.

**Fix:** Give units a dedicated field kind backed by `/api/catalog/units/master` + `/api/catalog/units/custom`, or at minimum point it at a units category. Reconcile with the `material_entries` `unitMode`/`unitMasterId`/`unitCustomId` columns.

### B5 — Machinery `hoursActive` required/optional mismatch — **LOW**
`entryFieldRegistry` marks `hoursActive` required with `min: 0`. `machineryLegacyShape` in `schemas.ts` requires `> 0` (`.positive()`). Entering `0` passes the client form and fails server validation with a generic message.

**Fix:** Align the bounds — make the schema accept `>= 0` (idle machinery is valid) or make the form enforce `min: 0.1`, and surface a specific message.

### B6 — Header shows a permanent unread dot and hardcoded identity — **LOW**
`AppHeader` always renders the red notification dot regardless of unread count, and shows a hardcoded "Operator" name with the role label.

**Fix:** Drive the dot from the unread count (the dashboard already loads `notifications.total`; lift it or fetch a lightweight count). Show the real user/email.

### B7 — README describes the wrong stack — **LOW**
`README.md` says "built on Next.js App Router with **Better Auth, Drizzle, and Neon**." The app now uses **Supabase Auth + Supabase Postgres** (Better-Auth tables were dropped in migration `0005`/`0006`).

**Fix:** Update the README stack description and setup notes.

---

## 7. Frontend & native-mobile feel

### F1 — All 15 `components/views/*` files are dead code — **MEDIUM**
`AdminAnalyticsView`, `ApprovalCenterView`, `HistoryView`, `HomeView`, `LabourEntryView`, `LiveFeedView`, `LoginView`, `MachineryEntryView`, `MaterialsEntryView`, `NotificationsView`, `ProfileView`, `SettingsView`, `SiteDetailView`, `SiteSelectionView`, `WorksiteDashboardView` — zero imports anywhere. `LoginView` even has non-functional inputs (no state, no `onChange`). Legacy from the pre-revamp UI.

**Fix:** Delete the entire `components/views/` directory. Check `lib/types/legacy.ts` similarly.

### F2 — Two conflicting `ApiUnavailableBanner` components — **MEDIUM**
`components/ui/ApiUnavailableBanner.tsx` is a **light-theme** banner (`bg-amber-50`, `text-amber-950`); `components/ui/page-primitives.tsx` exports a **dark-theme** one. Pages import inconsistently — the light one clashes badly with the dark app.

**Fix:** Keep one (the dark-theme variant), delete the other, update imports.

### F3 — `min-h-screen` instead of `min-h-dvh` (mobile viewport jump) — **MEDIUM, native-feel**
`AppShell` uses `min-h-screen` and the sign-in page uses `min-h-screen`. `100vh` on mobile includes the browser chrome, so content jumps and the fixed footer can sit behind the URL bar. The `<body>` already correctly uses `min-h-dvh`.

**Fix:** Replace `min-h-screen` with `min-h-dvh` in `AppShell` and `app/auth/sign-in/page.tsx` (and anywhere else).

### F4 — Navigation uses `router.push` / `window.location` instead of `<Link>` — **MEDIUM, native-feel**
`AppFooterNav` and `AppHeader` navigate via `router.push`. `DashboardPageClient` table rows use `window.location.href` — a **full page reload**, the most un-native transition possible.

**Fix:** Use `<Link>` (prefetch + instant client navigation) for footer nav items and dashboard rows. Reserve `router.push` for post-mutation redirects.

### F5 — List stagger delay scales with index — **LOW, native-feel**
`SiteDetailPageClient` single-type list uses `transition={{ delay: i * 0.05 }}`. With 50 entries the last item animates in at 2.5s — feels broken.

**Fix:** Cap the stagger (`delay: Math.min(i, 8) * 0.03`) or use a Framer Motion stagger container.

### F6 — Page transition `exit` never plays — **LOW, native-feel**
`app/app/template.tsx` wraps each page in `PageTransition`, whose `motion.div` defines `exit` variants — but there is no `AnimatePresence` parent, so exit animations never run; transitions are enter-only.

**Fix:** Either wrap with `AnimatePresence` keyed on pathname, or drop the unused `exit` props to avoid implying behavior that does not happen.

### F7 — Header back button uses raw `router.back()` — **LOW, native-feel**
On a deep link / fresh tab, `router.back()` exits the app instead of going to a sensible parent.

**Fix:** Navigate to an explicit parent route based on `pathname`, falling back to `/app/dashboard`.

### F8 — No optimistic UI / pull-to-refresh — **LOW, native-feel**
Creating an entry navigates away and waits for the round trip. There is no optimistic insert and no pull-to-refresh. `.mobile-scroll-area` (with `overscroll-behavior` and momentum scrolling) is defined in CSS but appears unused.

**Fix:** Add optimistic updates for entry create/delete, consider a pull-to-refresh on list screens, and apply `.mobile-scroll-area` (or remove it).

### F9 — PWA manifest gaps — **LOW, native-feel**
`public/manifest.json`: icons are **SVG only** (iOS home-screen and Android maskable icons need PNG `192`/`512`, plus a `purpose: "maskable"` icon); `start_url` is `/`, which redirects to `/app` then `/app/dashboard` — two hops on launch; no `id`, `scope`, `categories`, or `screenshots`.

**Fix:** Add PNG icons (incl. maskable), set `start_url` to `/app/dashboard`, add `id` and `scope`. The open `.docs/2026-05-23-pwa-installability-implementation-plan.md` should track this — align with it.

### F10 — Render-blocking icon font — **LOW**
`app/layout.tsx` loads the Google "Material Symbols Outlined" stylesheet synchronously in `<head>`, on top of `next/font` Inter. It blocks first paint.

**Fix:** Self-host via `next/font/local`, or load it `media="print" onload`-style async. Better: the app already depends on `lucide-react` — standardize on lucide icons and drop the Material Symbols font entirely (it is used via raw `<span className="material-symbols-outlined">` in `EntryForm`, `ProfilePage`, `SubcategoryCombobox`).

### F11 — Supabase browser client rebuilt every render — **LOW**
`createBrowserClient` is called inside the component body in `app/auth/sign-in/page.tsx` and `app/app/profile/page.tsx`.

**Fix:** Hoist to a module-level singleton or `useMemo`.

---

## 8. Code health & tooling

### T1 — No ESLint; `lint` is only `tsc` — **MEDIUM**
`package.json` `lint` is `tsc --noEmit`. There is no ESLint config, yet code contains `// eslint-disable-next-line` comments (e.g. `app/app/error.tsx`). No checks for React hook deps, accessibility, unused vars, or import order.

**Fix:** Add ESLint with `eslint-config-next` and the React-hooks + jsx-a11y plugins; make `lint` run both `tsc` and `eslint`.

### T2 — API routes do not pin the runtime — **LOW**
No route exports `runtime`. They are dynamic in practice (headers + `pg`), but `pg` is Node-only — an accidental Edge inference would break them.

**Fix:** Add `export const runtime = "nodejs"` to API routes (or set it once via a shared convention).

### T3 — Unused tsconfig options — **LOW**
`experimentalDecorators` and `allowJs` are enabled but unused.

**Fix:** Remove to keep `tsconfig.json` honest.

---

## 9. What is already good (keep it)

- `withApi`/`withApiRoute` wrapper: consistent request IDs, structured request logging, centralized rate limiting and 500 handling.
- Zod validation on most mutating routes; `handleDbError` maps PG error codes to clean 4xx with friendly constraint messages.
- JWT-claim-based role resolution avoids a per-request DB/Redis hit; middleware correctly overrides any client-supplied `x-siteops-*` headers.
- Redis cache with explicit, targeted invalidation (`lib/cache/invalidate.ts`) and graceful degradation when Redis is absent.
- `runNonCritical` cleanly separates best-effort work (notifications, cache invalidation) from the response path.
- Service worker scopes the API cache per user and clears it on auth change — a real correctness concern handled well.
- Partial indexes for the dominant "active sites" / "unread notifications" filters.
- `serializeRow` avoids the `JSON.parse(JSON.stringify())` round-trip for RSC→client data.

---

## Suggested fix order

1. **B1** — restore custom-category logging (broken feature).
2. **B2** — restore the missing CSS tokens (broken visuals, incl. error pages).
3. **S1 / S2 / E1** — transfers: ownership check, validation, idempotency, `handleDbError`.
4. **D1** — fix the `db:audit` join so integrity checks run.
5. **D2** — reconcile `schema.ts` with the live DB so the next migration does not drop indexes.
6. **A2 / R1 / D6 / D4** — dynamic-value validation, atomic duplicate handling, count coercion, incident date filter.
7. **F1 / F2 / F3 / F4** — delete dead code, dedupe the banner, `dvh`, `<Link>` navigation.
8. Remaining LOW items as polish.
