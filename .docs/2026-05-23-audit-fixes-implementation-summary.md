# Audit Fixes — Implementation Summary & Manual Test Guide

**Date:** 2026-05-23
**Scope implemented:** Critical + High + safe Medium/Low fixes from `2026-05-23-codebase-audit-report.md`.
**Files touched:** 50 (4 created · 16 deleted · 30 modified).
**Verification run:** `tsc --noEmit -p tsconfig.lint.json` → clean. `npm test` → 43/43 pass.

---

## 1. What was implemented

Severity / audit-ID → change.

### 🔴 Critical

| ID | Change | Files |
|----|--------|-------|
| **B1** | Custom-category entries are now driven by the category's approved `field_definitions`. New `DynamicEntryForm` fetches the tree, renders date + per-field inputs, posts one `/api/entries/dynamic` request per filled field. The category page chooses the dynamic vs. static form via `resolveEntryKind`. | `components/logs/DynamicEntryForm.tsx` (new) · `app/app/logs/new/[categoryId]/page.tsx` |
| **B2** | All undefined Material-3 tokens (`font-headline*`, `text-body*`, `font-label*`, `bg-error-container`, `text-on-error-container`, `bg-tertiary-container`, `bg-surface-tint`, `bg-scrim`, `surface-card`, `future-card`, `gap-density-medium`, `p-margin-mobile/desktop`, etc.) replaced with concrete Tailwind utilities across all consumers. The two light-themed admin pages were converted to dark `card-standard` heroes/error blocks. Scan for the undefined-token set → 0 hits. | `app/app/error.tsx`, `app/app/sites/[id]/error.tsx`, `app/app/profile/page.tsx`, `app/app/notifications/page.tsx`, `app/app/admin/{analytics,approvals,expenses,live-feed}/page.tsx`, `app/app/requests/{field,resource}/page.tsx`, `app/app/sites/new/SitesNewPageClient.tsx`, `app/auth/layout.tsx`, `components/ui/motion.tsx`, `components/logs/SubcategoryCombobox.tsx` |

### 🟠 High

| ID | Change | Files |
|----|--------|-------|
| **S1** | Transfers `POST` rewritten: Zod schema covers all fields including the full `resourceType` enum; both sites are loaded and validated (existence + not-archived); `checkOwnership` enforces `fromSiteId` must be supervised by the caller; `fromSiteId === toSiteId` rejected; insert wrapped in `handleDbError`. | `app/api/transfers/route.ts` |
| **D1** | `db:audit` join fixed — `s.id = e.site_id` (int = uuid → SQL error) replaced with `s.site_id = e.site_id` across all five entry orphan checks. `npm run db:audit` can now run. | `lib/db/audit.ts` |
| **D2** | `lib/db/schema.ts` reconciled with every index/constraint added by raw SQL migrations (`0002`/`0004`/`0007`): added `sites_archived_at_idx`; per-entry `*_site_date_idx`, `*_created_at_idx`, `*_created_by_idx`; `incident_reports_site_created_at_idx`, `incident_reports_reported_by_idx`; three `resource_requests_*` composites; two `field_requests_*` composites; `notifications_user_created_idx`, `notifications_user_read_idx`; `generic_entries_site_date_idx`, `generic_entries_field_definition_idx`; and the **unique** `field_definitions_subcategory_label_uidx`. Added `uniqueIndex` import. | `lib/db/schema.ts` |

### 🟡 Medium

| ID | Change | Files |
|----|--------|-------|
| **S2 / E1** | Transfers `PATCH` rewritten: Zod-validated body; `requireAdmin` guard; only `Pending → Approved/Declined` (idempotent if same status, `409 CONFLICT` otherwise) via conditional `UPDATE ... WHERE status='Pending'` + lost-race re-read; requester notification through `runNonCritical`; `handleDbError` wrapper. | `app/api/transfers/[id]/route.ts` |
| **A1** | New `siteIsArchived(entry)` helper; entry `PATCH`/`DELETE` now reject with `409` when the parent site is archived. | `app/api/entries/[id]/route.ts` |
| **A2** | Dynamic entry route validates `value` against `def.fieldType`: `Number` requires finite number, `Text` requires string, `Dropdown` already validated. | `app/api/entries/dynamic/route.ts` |
| **D3** | New `ALL_TYPE_PREVIEW_LIMIT = 5`; `getEntriesBySite(_, "all", _)` caps each of the five per-type fetches to 5 instead of 50 — site detail goes from ~250 rows over the wire to ~25. | `lib/db/queries/entries.ts` |
| **D4** | Incident date filter now compares `created_at::date` (cast to `date` in SQL) so a `YYYY-MM-DD` upper bound includes entries logged later that same day. | `lib/db/queries/entries.ts` |
| **D6** | Already returns an `int` (`count(*)::int` was present); confirmed correct, no change needed. | `lib/db/queries/notifications.ts` |
| **B3** | Profile card no longer renders the phantom `user.name` (which never existed in the `/api/users/me` response). Heading is now the user's email, subtitle is `profile.designation` if set. `ProfileResponse.user.name` dropped. | `app/app/profile/page.tsx` |

### 🔵 Low

| ID | Change | Files |
|----|--------|-------|
| **E3** | `getOrSetJson` rewritten so `compute()` runs **exactly once**. Cache `get` and `set` failures are independently caught and logged; neither triggers a second compute. | `lib/cache/getOrSetJson.ts` |
| **B5** | Machinery `hoursActive` registry `min` changed `0 → 0.1` so the client form rejects the same `0` value the server's `.positive()` schema would reject. | `components/logs/entryFieldRegistry.ts` |
| **B6** | `AppHeader` notification bell now polls `/api/notifications?limit=1&unreadOnly=true` on navigation and only renders the red dot when `unread > 0`. `aria-label` reflects count. | `components/app-shell/AppHeader.tsx` |
| **B7** | README stack updated: "Better Auth, Drizzle, and Neon" → "Supabase Auth, Drizzle ORM, and Supabase Postgres". | `README.md` |
| **F1** | All 15 `components/views/*.tsx` removed (0 imports). `lib/types/legacy.ts` also removed (only the deleted views referenced it). | (deleted) |
| **F2** | Single `ApiUnavailableBanner` (dark theme, compatible signature) in `components/ui/ApiUnavailableBanner.tsx`. `components/ui/page-primitives.tsx` re-exports it for the existing import path; the duplicate light-theme copy is gone. | `components/ui/ApiUnavailableBanner.tsx`, `components/ui/page-primitives.tsx` |
| **F3** | `min-h-screen` → `min-h-dvh` everywhere (`AppShell`, both auth pages, auth layout) — fixes the mobile-viewport jump / hidden-footer behind URL bar. | `components/app-shell/AppShell.tsx`, `app/auth/sign-in/page.tsx`, `app/auth/sign-up/page.tsx`, `app/auth/layout.tsx` |
| **F11** | New `lib/auth/browserClient.ts` exposes a module-level cached Supabase browser client. Sign-in, sign-up, and profile use `getSupabaseBrowserClient()` instead of constructing a new client per render. (`providers.tsx` was already correct — created inside an effect.) | `lib/auth/browserClient.ts` (new) · `app/auth/sign-in/page.tsx`, `app/auth/sign-up/page.tsx`, `app/app/profile/page.tsx` |

---

## 2. Deliberately deferred / not done

| ID | Why deferred |
|----|--------------|
| **S3** RLS policies | Defense-in-depth; needs deliberate DB role & policy design plus migration. Out of "safe blind change" scope. |
| **S5** SSE `maxDuration` cap | Single-line change but only meaningful alongside picking SSE vs long-poll — product decision. |
| **A3** missing role-claim observability | Already documented in `lib/auth/session.ts` as a JWT-TTL tradeoff. |
| **D5** `SELECT *` → explicit projections | Would touch ~10 list endpoints; some consumers may read the integer `id` we'd want to drop. Needs per-consumer review. |
| **D7** redundant entry indexes | Dropping indexes needs a migration; deliberately included in `schema.ts` for now so D2 keeps schema-vs-DB equal — clean up as a separate migration. |
| **D8 / D9** pagination for unbounded list endpoints | Behavior change; admin clients today assume full lists. |
| **D10 / R1** unique constraints on category/catalog names | Needs a migration that can fail on existing duplicate data. Should be paired with a dedup pass via `db:audit`. |
| **R2** field-request merge logic | Real product decision — what does "merge a duplicate category" do to existing references? Idempotency guard already in place via `reviewFieldRequest`. |
| **R3 / R5** budget-alert dedup, live-feed cursor | Behavior tweaks; not affecting correctness. |
| **S2 inventory movement** | Transfer approval still does not mutate any entries — explicitly out of scope and noted in the audit report. |
| **B4** material "Unit" picker | Form redesign — material entry needs a units-catalog combobox; deferred. |
| **F4–F10** native-feel polish (`<Link>` swap, optimistic UI, PWA manifest, render-blocking font, etc.) | Multiple sub-tasks; PWA manifest tracked separately in `.docs/2026-05-23-pwa-installability-implementation-plan.md`. |
| **T1 / T2** ESLint setup, explicit `runtime` exports | Tooling; no functional impact today. |

---

## 3. Self-review — per file

I re-read every change. Notes below capture the intent, the edge cases handled, what was *not* touched, and the smallest risks.

### `components/logs/DynamicEntryForm.tsx` (new)
- **Intent:** unblock B1.
- **Edge cases handled:** category with no `field_definitions` → "No fields defined" empty state with explanation; load error (fetch fail) surfaced in the same panel; required date input default = today (UTC `slice(0,10)` matches `entryDateSchema` server-side); `Number` field validated client-side before any POST; only filled fields are submitted (no spurious empty `text` writes).
- **Edge case NOT handled (called out explicitly):** there is **no transaction across fields**. If the user fills five fields and the third one fails server-side (e.g. validation), the first two are already inserted. The error toast says "Saved N field(s); X failed: …" so the user knows what landed. A future improvement is a batch `/api/entries/dynamic/batch` route that wraps the inserts in a single transaction.
- **Regressions:** none — static (`labour|material|machinery|expense|incident`) categories still go through the existing `EntryForm`.
- **Performance:** one tree fetch per page load; N sequential POSTs (intentional — easier failure attribution than `Promise.all`).

### `app/app/logs/new/[categoryId]/page.tsx`
- Branches on `resolveEntryKind(category.name)` — `"dynamic"` uses the new form, anything else uses `EntryForm`. Existing static-category flow unchanged.

### `app/api/transfers/route.ts` (S1)
- **Schema covers all 4 `resourceType` values** (the old hand-parser silently dropped `Money`/`Machinery`).
- **Ownership:** `fromSite` must exist + not be archived + `checkOwnership(session.user, fromSite.supervisorId)` — covers the previous bypass.
- **Same-site transfer rejected** via Zod `.refine`.
- **`toSite`** also verified to exist + not be archived.
- **`handleDbError`** added → bad FKs become friendly `409`s instead of opaque `500`s.
- **Edge case:** an Admin POSTing is still blocked by the existing `auth.session.user.role !== "Supervisor"` check (admins don't request transfers). Unchanged on purpose.
- **GET unchanged** — supervisors still don't see transfers *into* their site (audit D9, deferred).

### `app/api/transfers/[id]/route.ts` (S2 / E1)
- **`requireAdmin`** (was `requireSiteAccess` + manual role check).
- **Idempotency:** existing `Pending` row → conditional `UPDATE ... WHERE status='Pending'`. If the row was already in the requested terminal state, returns the row (200). If in the other terminal state, returns `409 CONFLICT`.
- **Race-loss path:** `updated[0]` empty → re-read; if status now matches → 200, else 409.
- **Notification** to the requester via `runNonCritical` — failure is logged, never blocks the response.
- **Edge case:** `link` on the notification is `/app/dashboard` because there is no supervisor-facing transfer detail page. Acceptable until that route exists.
- **Still does NOT mutate inventory** — explicit by design (audit report).

### `lib/db/audit.ts` (D1)
- All 5 entry orphan joins now `s.site_id = e.site_id`. Other checks (`orphan_sites_supervisor`, `orphan_notification_user`, `resource_status_without_approver`, `duplicate_field_definition_label`) were already correct.
- Risk: a stale environment that *does* have orphaned entries with `site_id` pointing to a deleted site will now correctly report them. Acceptable.

### `lib/db/schema.ts` (D2)
- ~25 index declarations added so `schema.ts` matches what `drizzle-kit migrate` actually produced via raw SQL.
- **The single UNIQUE index** (`field_definitions_subcategory_label_uidx`) is the most important — losing it would allow duplicate field labels per subcategory.
- **Verification step you must run before regenerating migrations:** see "Manual tests" §6 below. Run `npx drizzle-kit generate` and confirm it produces an empty diff. If anything diffs, the name in my declaration doesn't match the live DB name — adjust the string.

### `app/api/entries/[id]/route.ts` (A1)
- New `siteIsArchived` helper. Returns `true` if the site is missing **or** archived (defensive — a missing site is effectively read-only too).
- Inserted in both `PATCH` and `DELETE` paths after the ownership check.
- Side benefit: also handles the case where an entry has a dangling `siteId` (returns 409 — better than 500 on insert).

### `app/api/entries/dynamic/route.ts` (A2)
- Branches on `def.fieldType`. `Number`/`Text` validated against the actual JS type of `value` (Zod accepts `string | number | boolean`, so a string slipping into a `Number` field used to pass).
- Error messages quote the field label.

### `lib/db/queries/entries.ts` (D3 / D4)
- `ALL_TYPE_PREVIEW_LIMIT = 5` exported in case the UI ever wants to import the constant.
- `dateWhere` untouched for `date`-column tables; new `incidentDateWhere` casts `created_at::date` for the incident table only.
- `sql` import added.

### `lib/cache/getOrSetJson.ts` (E3)
- `compute()` runs at most once. Cache get failure: log + continue. Cache set failure: log + return computed value.
- Behavior on `!redis`: unchanged.

### `app/app/profile/page.tsx` (B3)
- `ProfileResponse.user` no longer claims a `name` field that the API never returned.
- Heading shows email; designation appears underneath only when set. Role chip unchanged.

### `components/app-shell/AppHeader.tsx` (B6)
- `useEffect` keyed on `pathname` so navigating away from `/app/notifications` triggers a fresh count fetch (i.e. marking-as-read clears the dot on return).
- Falls back to `0` on fetch error → dot hidden, never a misleading red badge.

### `components/logs/entryFieldRegistry.ts` (B5)
- One numeric change: `hoursActive` `min: 0 → 0.1`.

### `components/ui/ApiUnavailableBanner.tsx` + `components/ui/page-primitives.tsx` (F2)
- One canonical dark-theme banner. `page-primitives` re-exports it so historical imports still work.
- Optional props (`endpoint`, `method`, `message`) cover every existing call-site.

### `min-h-dvh` (F3)
- `AppShell`, both auth pages, auth layout. No other `min-h-screen` remained after the sweep.

### `lib/auth/browserClient.ts` + auth pages (F11)
- Module-level singleton. Throws clearly if env vars are missing instead of silently passing `undefined!`.

### Deletions (F1)
- 15 `components/views/*.tsx` + `lib/types/legacy.ts`. Verified zero imports before removal. Cannot regress any current code path; they were unreachable.

### B2 sweep (token migration)
- The sed mapping is in the implementation; the post-sweep grep for the entire undefined-token set returns 0 hits. Each affected page was spot-read after the sweep for layout integrity:
  - `app/app/error.tsx` / `app/app/sites/[id]/error.tsx`: red error-container → `bg-red-500/10 / text-red-300`; headings → `text-lg font-bold`; buttons → `bg-red-500 text-white`. **Visually distinct red alert, dark-theme consistent.**
  - `app/app/profile/page.tsx`: typography → `text-sm / text-xs font-semibold` etc. Layout preserved. Form inputs use the existing dark `bg-surface-container-lowest`.
  - `app/app/notifications/page.tsx`: type-meta colors → `bg-amber-500/15 / text-amber-300` for `budget_alert`, `bg-slate-500/15 / text-slate-300` for `system`, etc. All four notification types now have distinct chip colors on dark.
  - `app/app/admin/{analytics,expenses}/page.tsx`: light gradient hero → `card-standard`; light red error → dark red.
  - `app/app/admin/approvals/page.tsx`: review cards use `card-standard` + dark chips.
  - `app/app/admin/live-feed/page.tsx`: live-status chip + per-type icons rendered on dark.
  - `app/app/requests/{field,resource}/page.tsx`: status chips dark; form labels `text-xs font-semibold uppercase`.
  - `components/logs/SubcategoryCombobox.tsx`: review-warning callout uses defined `warning` color.
  - `components/ui/motion.tsx`: modal backdrop `bg-black/40` (was undefined `bg-scrim/40`).
  - `app/auth/layout.tsx`: `p-margin-*` → `p-4 md:p-8`.

### Risks / things to watch for after deploy
1. **D2 schema-vs-DB names** — see §6.
2. **DynamicEntryForm partial-write** — fields are not transactional. Verify with §3 manual test.
3. **Transfer notifications** — link target `/app/dashboard` is a placeholder. No supervisor-facing transfer view exists yet.
4. **Edit of dynamic entries** — `EntryForm`'s edit path is unchanged. The dynamic create path now works, but **editing a `generic_entries` row is still not implemented** anywhere. Out of scope.

---

## 4. Manual test guide

Run locally:

```bash
npm run dev
```

…and sign in as **a Supervisor** in one browser session and **an Admin** in another (incognito) so you can drive both sides of the approval flows.

### 4.1 Custom-category entries (B1) — most important
1. As **Supervisor**, go to **New Log** → pick a site → **+ Add Category**, create a category called e.g. `Quality Checks` (something not in `labour|material|machinery|expense|incident`).
2. From the supervisor side, you cannot add `field_definitions` directly. So:
   a. Create a **subcategory** under the new category (e.g. `Concrete Pour`).
   b. Open **Field Requests** → propose a field, e.g. `proposedName=Slump (mm)`, `categoryId=<id>`, `subcategoryId=<id>`, `fieldType=Number`.
3. Switch to **Admin** → **Approvals** → approve the field request. Confirm: a `field_definitions` row is created (check via `db:audit` or DB).
4. Back as Supervisor → **New Log** → pick the same site → pick `Quality Checks`.
   - **Expect:** the new `DynamicEntryForm` renders with a date input and a `Slump (mm)` numeric input.
   - **Edge case A:** if you didn't approve the field, the form shows _"No fields defined for this category yet"_ — confirm copy.
5. Enter a value, submit.
   - **Expect:** toast `Logged 1 field for Quality Checks`, redirect to site detail. New row visible (entry list shows under the dynamic type if you have one, otherwise via DB).
6. **Edge case B — partial failure:** propose a *second* field, **decline** it as Admin so it never lands. Then approve a 2nd valid field. From the form, type a non-numeric string into a `Number` field (use DevTools to bypass `<input type="number">`). The client guard should toast `"<label> must be a number"` before any POST. Confirm no entry created.
7. **Edge case C — type check on server (A2):** craft a request with `curl` that posts `value: "abc"` to a `Number` field definition. Confirm `400` with body `"…expects a number"`.

### 4.2 Transfers POST ownership (S1)
1. As **Supervisor A**, create a site you supervise (Site X) and one you do not.
2. Find another site (Site Y) supervised by **Supervisor B**.
3. From Supervisor A's session, open **Transfers → New**, try to create a transfer with `fromSiteId = Y` and `toSiteId = X`.
   - **Expect:** `403` — `"You can only transfer resources from sites you supervise"`.
4. Try `fromSiteId = X`, `toSiteId = X` (same site).
   - **Expect:** `400` validation error — `"Source and destination sites must differ"`.
5. Try with an archived `toSiteId`.
   - **Expect:** `404` — `"Destination site not found"`.
6. Try `resourceType = "Money"` (was silently dropped before).
   - **Expect:** request now accepted (or rejected only by schema if other required fields missing) — confirm a row is created with `resource_type='Money'`.
7. Provide an `invalid-uuid` for `fromSiteId`.
   - **Expect:** `400 VALIDATION_ERROR` instead of `500`.

### 4.3 Transfers PATCH idempotency (S2/E1)
1. As **Admin**, approve a Pending transfer.
   - **Expect:** `200` with the updated row + a notification appears in the requester's bell.
2. Hit the same `PATCH … status=Approved` again.
   - **Expect:** `200` returning the same row, no second notification (the conditional `WHERE status='Pending'` ensures the update doesn't run twice).
3. Try `PATCH … status=Declined` on the now-approved row.
   - **Expect:** `409 CONFLICT` — `"Transfer already reviewed"`.
4. Concurrent race: open two admin sessions, both hit Approve at the same instant via DevTools.
   - **Expect:** one wins (200), the other gets a 200 with the resolved row, or a 409 — never two notifications and never an inconsistent row.

### 4.4 Entry edit/delete on archived site (A1)
1. As Admin, archive a site that has at least one labour entry.
2. As the entry's original author (Supervisor), try to PATCH or DELETE that entry.
   - **Expect:** `409 CONFLICT` — `"Site is archived; entries are read-only"`.
3. Sanity check: editing an entry on a non-archived site still works.

### 4.5 Site-detail over-fetch (D3)
1. Open the site detail page for a site with > 20 entries of each type.
2. DevTools → Network tab → reload.
   - **Expect:** the initial SSR payload is smaller; the rendered "all" grouped view shows up to 5 rows per group (the UI slice is still 3).
3. Click the "Labour" filter chip.
   - **Expect:** a full 50-row request (the per-type API path is unchanged).

### 4.6 Incident date filter (D4)
1. Create an incident report at, say, 14:00 today.
2. Browse the site's entries with `from=YYYY-MM-DD` and `to=<today>`.
   - **Expect:** the incident is included. Before this fix, an incident logged any time after 00:00:00 today was dropped from a range ending today.

### 4.7 Notification count drives the bell (B6)
1. As Admin, trigger a notification for the supervisor (decline a request, etc.).
2. As Supervisor in another browser, refresh.
   - **Expect:** red dot visible. `aria-label` reads "1 unread notification".
3. Open Notifications → "Mark all read" → click the back button.
   - **Expect:** dot gone.
4. With no unread, force the API to return `{ total: 0 }` (or just have no notifications) and confirm dot is hidden.

### 4.8 Profile page (B3)
1. Open `/app/profile`.
   - **Expect:** heading = your email; if you've saved a `Designation`, it appears beneath. No more placeholder `—` where the phantom name used to be.
2. Save a designation → reload → confirm it shows under the email.
3. Sign Out button → should still sign you out (F11 singleton path).

### 4.9 `min-h-dvh` (F3)
1. On mobile (or Chrome DevTools device toolbar), open the app and scroll.
2. The footer nav should stay above the URL bar; no jump when the bar collapses.

### 4.10 Banner dedup (F2)
1. Disconnect network → hit a page that calls a non-existent endpoint or a route returning 404 with `code !== 'NOT_FOUND'`.
2. The banner appears identical (dark, amber accent) everywhere — profile, notifications, admin pages, requests, site detail.

### 4.11 `getOrSetJson` single compute (E3)
- Hard to trigger manually without breaking Redis. If you can stub Redis to throw on `set`, the compute should *not* run twice. Verified by the cache test path; the logic change is small and reviewed by reading.

### 4.12 Unit / typecheck verification
```bash
npm run lint    # tsc --noEmit; should print nothing
npm test        # 43 tests pass
```

### 4.13 D2 — schema reconciliation verification
Before merging:

```bash
# Make sure DATABASE_URL points at the dev DB (NOT production)
npx drizzle-kit generate
```

- **Expect:** an **empty** migration is produced (or no new migration file at all). That confirms `schema.ts` now matches the live DB exactly.
- If `generate` proposes adding or dropping an index, the name in my schema declaration doesn't match the live DB name. Cross-reference with `0002_production_hardening.sql` / `0004_add_perf_indexes.sql` / `0007_perf_indexes_v2.sql` and adjust.
- Then:
  ```bash
  npm run db:audit
  ```
  Should run end-to-end now (D1 fix). Confirm zero failing checks on a healthy DB.

### 4.14 Dead-code removal (F1)
- `git grep "components/views"` → 0 hits.
- App still builds (`npm run build` if you want full confidence — typecheck already passed).

---

## 5. Known limitations / follow-ups for the reviewer

- **DynamicEntryForm has no transactional batch.** A future `/api/entries/dynamic/batch` route wrapping inserts in a single transaction would be cleaner. Document this in the dynamic form's empty/error states if it bites users.
- **Transfer approval has no inventory effect.** Still status-only by design.
- **Field-request merge is still a no-op** (R2/R3) — declining a `[Category Review]` row just flips it to `Declined` without actually merging the duplicate.
- **Unique constraints on category/catalog names (R1/D10)** require a migration + dedup; recommend pairing with the next `db:audit` pass and a deduplication script.
- **B2 typography migration** changed a lot of `font-headline-*` / `text-label-*` → utility classes. The visual hierarchy is preserved but may be a half-step lighter than the old M3 scale would have been. Eyeball the error pages and notifications page; tighten weights if needed.
- **Admin analytics & expenses heroes** are now `card-standard` (dark). The old light gradients are gone — confirm with whoever owns the design.

---

*Generated 2026-05-23. Built against tsc-clean + 43/43 vitest passing.*
