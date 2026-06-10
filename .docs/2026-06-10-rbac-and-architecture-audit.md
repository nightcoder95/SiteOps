# SiteOps Audit — RBAC Hardening + Codebase Architecture

**Date:** 2026-06-10
**Scope:** (1) RBAC foundation branch `feat/rbac-foundation` — completeness, security, performance. (2) Full-codebase architecture, DRY/KISS, backend, DB, UI/UX.
**Method:** Focused inline review. Report + suggested fixes only — nothing applied.
**Verification run:** `npm run typecheck` → exit 0. RBAC unit tests (`lib/auth`, `app/api/admin/users`) → **30/30 pass**.

Severity legend: **CRITICAL** · **HIGH** · **MED** · **LOW** · **NIT**

---

## Part 1 — RBAC

### Verdict
The implementation closely matches the design spec and is high quality. Capability model is clean (deny-by-default, O(1) `Set.has`, single source of truth). The hard parts are done correctly: last-admin race guard via `SELECT … FOR UPDATE`, stateful actor re-check on the two privilege-critical endpoints, orphan rollback on provisioning, `after()`-scheduled audit, `no-store` on permission-sensitive responses, per-method capability mapping. Findings below are mostly hardening + one real gap.

### Strengths (keep)
- `can()` deny-by-default with `?? false` for unknown roles — [lib/auth/capabilities.ts:104](lib/auth/capabilities.ts#L104).
- Last-admin demotion is race-safe: admin rows locked `.for("update")` inside the txn — [app/api/admin/users/[id]/role/route.ts:60-79](app/api/admin/users/[id]/role/route.ts#L60-L79).
- Stateful actor check bypasses the JWT header on write paths — [app/api/admin/users/route.ts:83-88](app/api/admin/users/route.ts#L83-L88).
- Compensating delete prevents orphaned auth users — [app/api/admin/users/route.ts:129-136](app/api/admin/users/route.ts#L120-L136).
- Audit via `after()` survives serverless context freeze — [lib/audit/log.ts:38-42](lib/audit/log.ts#L38-L42).
- Hook is `SECURITY DEFINER` with `search_path` pinned and grant scoped to `supabase_auth_admin` — [migration 0013](lib/db/migrations/0013_custom_access_token_hook_must_change_password.sql).

### Security findings

**S1 — `POST /api/auth/change-password` has no re-authentication and no `must_change_password` gate. (HIGH)**
[app/api/auth/change-password/route.ts:25-31](app/api/auth/change-password/route.ts#L25-L31) guards with `requireAuth` only. Any authenticated session can set a new password with no current-password proof and no check that the account is actually in the forced-change state. Consequence: a hijacked/borrowed session (XSS, unlocked device, shared kiosk) → attacker sets a new password → account takeover + owner lockout. Standard password-change flows require current-password re-auth.
*Fix (pick one):*
- Gate the endpoint to `mustChangePassword === true` — re-read the flag from `user_profiles` (DB, not the JWT claim) and 403 otherwise. Cheapest, keeps the endpoint single-purpose (forced rotation only). Provide a separate self-service change flow later if needed.
- OR require `currentPassword` in the body and verify via `supabase.auth.signInWithPassword({ email, password: currentPassword })` before updating.

**S2 — `GET /api/admin/users` skips the stateful actor check; demoted admin can enumerate accounts for up to the JWT TTL (~1h). (LOW — by design, flag)**
[app/api/admin/users/route.ts:32-38](app/api/admin/users/route.ts#L32-L38) trusts the header role. The design accepts stateless reads, but this read leaks every user id + email. Also `listUsers({ perPage: 1000 })` silently truncates beyond 1000 accounts — [route.ts:53](app/api/admin/users/route.ts#L53).
*Fix:* either add the same `getActorRoleFromDb` check here (it's a cold admin path), or accept the window explicitly in the spec. Paginate `listUsers` if the tenant can exceed 1000 users.

**S3 — Audit metadata stores raw email (PII). (LOW)**
[app/api/admin/users/route.ts:145](app/api/admin/users/route.ts#L145) writes `{ email, role }` into `audit_logs.metadata`. Fine functionally; add a retention/redaction policy note so audit rows aren't an unbounded PII store.

**S4 — First-admin seed leaves `must_change_password = false`. (LOW)**
[lib/db/seeds/first-admin.sql:44](lib/db/seeds/first-admin.sql#L44). The bootstrap password is typed into psql/shell history and never forced to rotate.
*Fix:* seed `true` so the first admin rotates on first login (the comment already hints at this — make it the default).

**S5 — `sites/[id]` GET runs the cache+DB read in parallel with auth, before the session is confirmed. (LOW)**
[app/api/sites/[id]/route.ts:36-47](app/api/sites/[id]/route.ts#L36-L47). `Promise.all([requireCapability, getOrSetJson])` means an unauthenticated/forbidden caller still triggers the DB read and populates the cache key. No data leak (still 401/403), but wasted work + cache pollution on behalf of unauthorized callers.
*Fix:* await auth first, or accept the latency trade-off explicitly. Low priority.

### Performance findings
- **Hot path unchanged — confirmed.** Capability checks are in-memory; no DB/network added. Middleware reads `must_change_password` as an O(1) claim decode — [middleware.ts:61](middleware.ts#L61). Audit is denial/admin-write only via `after()`. This matches §7 of the spec.
- **P1 — `GET /api/admin/users`** does a full `user_profiles` scan + a 1000-row `listUsers` per request (no cache). Acceptable at current scale; revisit if user count grows (same as S2 truncation).

### Completeness / spec drift

**C1 — `AppHeader.tsx` was not migrated to capabilities. (MED — spec-incomplete)**
Spec §5 says swap `AppHeader.tsx` to capability checks. It still declares `role: 'Admin' | 'Supervisor'` and branches on `role === 'Admin'` — [components/app-shell/AppHeader.tsx:10,60](components/app-shell/AppHeader.tsx#L10). Only a label switch (not a security gate), but: it's a hardcoded role literal the spec wanted removed, and the union type duplicates `Role` from `lib/auth/roles.ts`. By contrast `AppFooterNav` was migrated correctly (`can(role, 'resource:manage_all')`).
*Fix:* type the prop as `Role`, and if any branch is access-relevant use `can()`.

**C2 — `z.enum(ALL_ROLES as unknown as [string, ...string[]])` loses literal typing. (NIT)**
[app/api/admin/users/route.ts:18](app/api/admin/users/route.ts#L18). Works, but the double cast defeats the enum's compile-time role check. Consider `z.enum(ROLES_TUPLE)` where `ROLES_TUPLE` is a `readonly [Role, ...Role[]]` derived once in `roles.ts`.

**C3 — Change-password redirect-loop path is manual-test only.** Tests cover guards, capabilities, provisioning, role-change. The `must_change_password` → `refreshSession()` loop (spec test #11) and the middleware redirect exclusions have no automated coverage. Add an integration test or document as a release smoke check.

---

## Part 2 — Codebase Architecture

### Verdict
Structure is sound: `lib/` is cleanly split by domain (`auth`, `cache`, `db`, `errors`, `http`, `rateLimit`, `validation`…), and the 39 API routes mirror the `app/` tree. Centralized cross-cutting concerns (`withApi`, `errorResponse`, `handleDbError`, `applyRateLimit`) are real and used consistently. The main debt is **type-erasure (`as any`) around the entry models** and **repeated numeric-coercion / request-plumbing boilerplate**, plus a couple of oversized files.

### DRY / KISS

**A1 — Decimal coercion duplicated everywhere. (MED)**
`typeof x === "number" ? String(x)` appears 12× across 4+ route files (Drizzle `decimal` columns want strings). [entries/[id]/route.ts:110-137](app/api/entries/[id]/route.ts#L110-L137) is the worst — ~15 near-identical lines.
*Fix:* push coercion into the zod schema with `.transform(String)` on money/quantity fields (one definition, applied at parse time), or a `coerceDecimals(obj, keys)` helper. Removes the manual blocks and the matching `as any` casts.

**A2 — Per-route request plumbing repeated in ~28 files. (LOW)**
`parseJsonBody → validateBody → (guard)` is copy-pasted. Consider a `withApi` overload that accepts `{ schema, capability }` and yields parsed `body` + `session`, collapsing ~6 lines/route and making the guard impossible to forget.

**A3 — 32 `as any` casts in `app/api` + `lib/db`, concentrated on entry rows. (MED)**
e.g. `(existing as any).createdBy`, `(updateData as any).amount` — [entries/[id]/route.ts:78,111](app/api/entries/[id]/route.ts#L78). The entry union (labour/material/machinery/expense/incident) isn't modeled, so every field access escapes the type system. This is where a real bug will hide.
*Fix:* define a discriminated `EntryRow` union (or per-type row types) and an `entryOwnerId(entry)` accessor.

**A4 — Owner-id extraction duplicated.** `createdBy ?? reportedBy ?? null` appears twice in the same file ([entries/[id]/route.ts:78,269](app/api/entries/[id]/route.ts#L78)). Extract `entryOwnerId()` (pairs with A3).

**A5 — Oversized files. (LOW)**
`OperationDetailPageClient.tsx` (801 LOC), `lib/db/queries/entries.ts` (711), `EntryForm.tsx` (446), `schema.ts` (435). Split by responsibility — the spec's own "smaller, well-bounded units" principle. Largest client file mixes fetch + state + render across five entry types.

### Backend / DB
- **Good:** `handleDbError` centralizes unique/FK mapping; `runNonCritical`/`after()` keep non-critical writes off the response path; rate-limit keys by `userId` then IP — [lib/rateLimit/guard.ts:19-23](lib/rateLimit/guard.ts#L19-L23).
- **D1 — RLS likely OFF on core tables. (HIGH→CRITICAL if confirmed — verify in Branch 1)** Verified: **no migration enables RLS or defines a policy** on any table; the only RLS statements (`0006`) `DISABLE` RLS on legacy Better Auth tables (`accounts/sessions/users/verifications`, removed in `0005`) — not the core domain tables. Postgres defaults RLS off, so unless it was enabled via the Supabase dashboard (untracked), `user_profiles/sites/*_entries/audit_logs` have **no RLS**. Because the anon key is `NEXT_PUBLIC_*` (in every browser), RLS-off = direct PostgREST access bypasses all app guards. Arbiter query + remediation in **Branch 1**. (Severity upgraded from the round-1 "unverified MED" after migration review.)
- **D2 — Audit indexes are correct** (`actor+created`, `action+created`, both `DESC NULLS LAST`) — [migration 0012:22-23](lib/db/migrations/0012_nifty_squadron_sinister.sql#L22-L23).

### UI / UX  *(via ui-ux-pro-max checklist)*

**U1 — No `prefers-reduced-motion` handling anywhere, but 8 files animate via `motion/react`. (HIGH a11y — WCAG 2.3.3)**
0 occurrences of reduced-motion guards. Entry/auth pages animate opacity+translate on mount; nav uses spring layout animation.
*Fix:* gate animations behind `useReducedMotion()` (motion/react provides it) or a global `@media (prefers-reduced-motion: reduce)` rule that disables transitions.

**U2 — Icon-only buttons largely unlabeled. (MED a11y)**
58 `<button>` vs 14 `aria-label`. `AppFooterNav` labels correctly; many others (toolbars, form affordances) likely don't. Audit icon-only buttons for `aria-label`.

**U3 — Two competing design-token systems. (MED consistency)**
Auth pages use raw Tailwind (`bg-slate-950`, `text-white`, `text-sky-400`) + `globals.css` CSS vars (`--color-surface`); app/admin pages use Material-style semantic classes (`bg-surface-container-lowest`, `text-on-surface`, `border-outline`, `bg-primary`). Same product, two vocabularies — e.g. [change-password/page.tsx](app/auth/change-password/page.tsx) vs [admin/users/page.tsx](app/app/admin/users/page.tsx).
*Fix:* pick one token layer (recommend the semantic one) and converge auth pages onto it.

**U4 — Touch targets + tiny text below minimums. (MED a11y)**
Inputs/selects at `h-10` (40px) and `h-11` (44px borderline) — min recommended 44×44. Heavy use of `text-[9px]`/`text-[10px]` uppercase labels is below the readable floor.
*Fix:* bump interactive controls to ≥44px; raise micro-labels to ≥11–12px or ensure they're decorative, not the only label.

**Good:** focus rings present (`focus:ring-1 focus:ring-primary`), form inputs use `<label htmlFor>`, loading buttons disable during async, SVG icons (lucide) not emoji, `min-h-dvh` used.

---

> **Canonical sequencing lives in the Implementation Plan's dependency graph (end of doc).** This Part-1 list and the Round-2 list below are kept only as the per-finding severity snapshots they were written as — they are **not** the execution order. Follow the plan's merge order.

*No code changed. Review and select what to schedule for implementation.*

---

# Audit Round 2 — Types, Services, Performance, Toasts, PWA

*Added 2026-06-10. Same method: report + suggested fixes, nothing applied.*

## Part 3 — Dedicated `types/` directory (PLAN)

**Current state:** `lib/types/` exists but holds only two near-empty stubs (`api.ts` 186 B, `domain.ts` 155 B). **29 exported types/interfaces are scattered across ~25 directories** — component prop types, API DTOs, and domain models all defined inline next to their first use. There is no single place to find "what shape is an Entry / Site / AdminUser".

**Why it matters:** scattered types get duplicated (e.g. the `'Admin' | 'Supervisor'` union in `AppHeader.tsx` duplicating `Role`; `AdminUser` redefined in the admin page), drift out of sync, and make the entry-row `as any` problem (A3) worse because there's no canonical row type to import.

**Plan — `lib/types/` split by functionality (one file per domain):**
```
lib/types/
  index.ts        # barrel re-export
  auth.ts         # Role, Capability, Session, SessionUser  (re-export from auth modules)
  user.ts         # AdminUser, UserProfile DTOs
  site.ts         # SiteRow, SiteCreate/Update DTOs
  entry.ts        # EntryRow discriminated union + per-type rows (fixes A3/A4)
  request.ts      # FieldRequest, ResourceRequest DTOs
  transfer.ts     # Transfer DTOs
  form.ts         # Category / Subcategory DTOs
  api.ts          # shared ApiResult<T>, error envelope, pagination
  audit.ts        # AuditEntry (move from lib/audit/log.ts)
```
**Rules:** domain/DTO/shared-shape types live here; **component-local prop types stay with the component** (co-location is correct for one-off props — don't over-centralize). Derive from Drizzle (`$inferSelect`/`$inferInsert`) where a type mirrors a table so DB and types can't drift. Migrate incrementally: create `entry.ts` first (unblocks A3/A4), then move shared DTOs, leave prop types in place.

## Part 4 — Dedicated service directory for APIs (PLAN)

**Current state:** `lib/services/` **already exists** (`dashboard.ts`, `reviews.ts`, `duplicateGuard.ts`, `nonCritical.ts`) — but it's under-used (265 LOC total). Most route handlers still inline their business logic: `entries/[id]` (287 LOC), `forms/categories` (227), `forms/subcategories` (217), `transfers` (142) mix validation + coercion + DB + business rules in the handler.

**Plan:** keep `lib/services/` as the home; **consistently extract** per-domain logic into it so routes become thin (guard → parse → call service → respond):
```
lib/services/
  entries.ts      # create/update/delete + decimal coercion + split-labour rules
  sites.ts        # create/list/archive + supervisor-scoping
  forms.ts        # category/subcategory create + similar-merge
  transfers.ts    # transfer create + validation
  requests.ts     # field/resource request workflows
  users.ts        # provision + role-change orchestration (pairs with RBAC)
  reviews.ts      # (exists)  dashboard.ts (exists)
```
Target: no `app/api/**/route.ts` over ~80 LOC. This directly shrinks the A1/A3/A5 debt and makes handlers testable without HTTP plumbing.

## Part 5 — Performance audit (native-snappy goal)

> **Measure first (skill rule).** The "super snappy" goal is currently **unmeasured**: no `web-vitals`/RUM (0 hits). `@vercel/speed-insights` is mounted (field LCP/CLS only). **Step 0: add `web-vitals` → PostHog** (`onLCP/onINP/onCLS`) before/after each change below, so "snappy" has numbers.

**Strengths:** server cache via `getOrSetJson` (6 routes), serwist SW with SWR API cache + NetworkFirst navigation, hash-immutable static caching + AVIF/WebP image config in `next.config.ts`, `loading.tsx` on 8 routes, no oversized images (icon-font UI).

**P2 — No client data-cache layer. (HIGH — biggest snappiness lever)**
0 uses of SWR/React Query; **18 client files fetch raw via `requestJson` in `useEffect`.** Every screen visit refetches from scratch, no dedupe, no cache-then-revalidate, no optimistic updates. This is what makes a web app feel "webby" vs native.
*Fix:* adopt **SWR** (lightest) or TanStack Query — instant stale-render + background revalidate, request dedupe, and optimistic mutations for create/update/delete (entries, transfers, role-change). The SW already SWR-caches GET `/api/*`; a client cache compounds it. Single highest-impact change for perceived speed.

**P3 — No code-splitting. (MED)**
0 `next/dynamic`/`lazy`. 32 `'use client'` files ship in route bundles, including heavy ones (`OperationDetailPageClient` 801 LOC, `EntryForm` 446, `motion/react` in 8 files).
*Fix:* `next/dynamic` for heavy/rare client components (operation detail, dynamic entry form, any charts/modals). Lazy-load `motion` or drop it where a CSS transition suffices (also helps U1 reduced-motion).

**P4 — Under-memoized lists. (MED)**
Only 11 `useMemo/useCallback/memo` across the app. Long lists (operations, entries, admin users) re-render fully on parent state change.
*Fix:* memoize list rows + derived computations in the large client pages; stabilize callback/object props (skill anti-pattern #4).

**P5 — Skeleton coverage partial. (LOW)**
8 `loading.tsx` for 27 page/layout files. Native feel = never a blank screen.
*Fix:* add route `loading.tsx` skeletons for the remaining data screens; pair with P2's stale-render so navigation paints instantly.

**P6 — Middleware runs Supabase `getClaims()` on nearly every request. (LOW — verify)**
The matcher excludes static assets but covers all pages+API. `getClaims()` verifies JWT locally against cached JWKS (no Auth round-trip) so cost is low, but confirm JWKS is cached at the edge and the matcher isn't catching prefetch/RSC noise.

## Part 6 — Toast notification quality (MED — UX)

**Finding:** 79 toast call sites; messages are **inconsistent** — friendly ones ("Site created", "Transfer request submitted", "Entry deleted") coexist with **raw pass-through dev/backend strings**:
- `toast.error(res.message)` — ~15+ sites surface the API error string directly (may read "Validation error", a DB constraint message via `handleDbError`, or an internal code).
- `toast.error(signInError.message)` / `signUpError.message` — raw Supabase/GoTrue text ("Invalid login credentials").
- `toast.error(err)` — raw error object/string ([TransferForm](components/transfers/TransferForm.tsx)).

**Why it matters:** users see developer/system language; copy isn't controllable or localizable; security-sensitive detail can leak.
*Fix:* add a small **error-code → friendly-copy map** (`lib/ui/toastMessages.ts`) keyed on `ERROR_CODES`. Client helper `notifyError(result)` looks up friendly copy by `result.code`, falling back to a generic "Something went wrong — please try again." Replace `toast.error(res.message)` with `notifyError(res)`. Keep raw `message` only in logs/`requestId`, never the toast. Standardize success copy as verb + noun ("Account created", "Role updated") — most already follow this.

## Part 7 — PWA gap analysis (to "full PWA" + native feel)

**Already in place (good):** `@serwist/next` + `app/sw.ts` (user-scoped SWR API cache, NetworkFirst navigation w/ 3s timeout + 24h page cache, precache manifest, admin/live-feed correctly excluded), `manifest.json` (standalone, portrait, maskable + any icons, categories), iOS `appleWebApp.capable` + `apple-touch-icon`, `theme_color`, safe-area CSS vars, immutable static caching.

**Gaps:**

**PWA1 — `viewport-fit=cover` is missing, so the safe-area insets are inert. (MED — quick win)**
`globals.css` defines `--sat/--sab` from `env(safe-area-inset-*)` and `.safe-area-*` utilities, but `viewport` in [app/layout.tsx:39](app/layout.tsx#L39) sets only `themeColor` — without `viewportFit: "cover"` the insets resolve to 0 in standalone, so content can sit under the notch / home indicator. This is the difference between "looks installed" and "looks native."
*Fix:* `export const viewport: Viewport = { themeColor: "#020617", viewportFit: "cover" }`.

**PWA2 — No offline fallback. (MED)**
NetworkFirst navigation with a 3s timeout means: offline + uncached route → browser error page, not an app screen.
*Fix:* add an `app/~offline/page.tsx` (or `/offline`) and register it as a serwist navigation `fallback` so offline always lands on a branded screen.

**PWA3 — No custom install prompt (A2HS). (MED — native feel)**
0 `beforeinstallprompt` handling. Users can install via browser menu but there's no in-app affordance.
*Fix:* capture `beforeinstallprompt`, stash the event, show a dismissible "Install SiteOps" button (and `appinstalled` cleanup). iOS has no event — show a one-time "Add to Home Screen" hint on iOS Safari.

**PWA4 — No background sync for offline writes. (MED — native expectation)**
Field workers on bad signal expect a log/transfer submitted offline to send later. No `BackgroundSyncQueue`; `no-store` on permission endpoints is fine, but entry/transfer POSTs aren't queued.
*Fix:* serwist `BackgroundSyncQueue` for `POST /api/entries/*` and `/api/transfers` with an outbox; reflect "pending sync" in the UI. Larger effort — schedule separately.

**PWA5 — `manifest.json` enrichment. (LOW)**
Missing `screenshots` (richer install dialog / store listing), `shortcuts` (quick actions like "New Log", "Transfers"), and `display_override: ["standalone","minimal-ui"]`.
*Fix:* add `shortcuts` for the top tasks and `screenshots` (narrow + wide form factors).

**PWA6 — No web push. (LOW — optional)**
The app has a notifications domain but no `web-push`/Push API. If push alerts (approvals, incidents) are desired for native parity, that's a dedicated workstream (VAPID keys, subscription storage, opt-in UX). Flag, don't bundle.

---

## Round-2 severity snapshot (not the execution order)
Highest-impact findings at a glance: **S1+M1** (security takeover + session revocation), **P2** (client data-cache — snappiness lever), **D1** (RLS binary unknown — verify now), **U1 + PWA1** (cheap native-feel wins). Execution sequence is the Implementation Plan dependency graph below — follow that, not this list.

*All findings are reports. Nothing applied. The types/ and services/ reorganizations are explicitly scoped as plans for a follow-up branch.*

---

# Implementation Plan

Sequenced into independent branches (≈ one PR each). Ordered so foundational work (types, services) lands before the refactors that depend on it. Each task lists files, the concrete change, and acceptance criteria. **Every branch ends green:** `npm run typecheck` exit 0 + `npm test` pass.

Effort key: **S** ≤2h · **M** ½–1 day · **L** multi-day.

---

## Branch 1 — Security: change-password + session revocation + RLS check (S1, M1, M2, M3) `[S]` — do first

**Goal:** close the account-takeover vector end-to-end. No session may reset a password without proof, **and** rotating the password must kill other live sessions.

1. **S1 + M2 — require re-auth (adopt option 2, single endpoint).** [app/api/auth/change-password/route.ts](app/api/auth/change-password/route.ts): add `currentPassword` to the zod schema; verify via `supabase.auth.signInWithPassword({ email, password: currentPassword })` before updating. This covers **both** forced rotation (user re-enters the temp password they just logged in with) and future self-service — no second endpoint, no build-to-throw. Drop the "gate to forced-rotation-only" option.
   - [app/auth/change-password/page.tsx](app/auth/change-password/page.tsx): add a "current/temporary password" field.
2. **M1 — revoke other sessions after rotation. (HIGH, was missed)** After the password update succeeds, revoke the user's existing refresh tokens so a stolen session can't survive the rotation. `invalidateUserClaims` only bumps `app_metadata` — it does **not** revoke ([refreshClaims.ts:10-15](lib/auth/refreshClaims.ts#L10-L15)).
   - **Verify the mechanism first** in the installed `@supabase/supabase-js`: prefer `supabase.auth.admin.signOut(userId, 'global')` if available; otherwise revoke/delete the user's sessions via the admin API. Add as `revokeUserSessions(userId)` in `refreshClaims.ts` (or a new `lib/auth/sessions.ts`).
   - **Apply the same revocation to role demotion** in [app/api/admin/users/[id]/role/route.ts](app/api/admin/users/[id]/role/route.ts): on a demotion (Admin → lower), call `revokeUserSessions(targetId)` so the demoted admin loses access immediately, not after JWT TTL. (Promotions don't need it.) This closes the write-path half of S2.
3. **M3 — raise the password floor.** [route.ts:17](app/api/auth/change-password/route.ts#L17) and the provision schema: bump `min(8)`; reject trivial/breached where feasible (length ≥10 or a zxcvbn-style check). Low effort, note in PR.
4. [lib/auth/actorRole.ts](lib/auth/actorRole.ts) — if any branch still needs the flag, add `getActorMustChangePassword` / combined `getActorProfile`.
5. **D1 — verify RLS NOW (moved up from Branch 8).** Cheap, binary, potentially catastrophic.
   - **Verified from migrations:** **no** migration contains `ENABLE ROW LEVEL SECURITY` or `CREATE POLICY` for any table. The only RLS statements are in `0006` — `DISABLE` on `accounts/sessions/users/verifications`, which are **legacy Better Auth tables removed in `0005`**, *not* the core domain tables. So migrations neither enable nor disable RLS on `user_profiles`, `sites`, `*_entries`, `audit_logs`.
   - **Why migrations aren't the arbiter:** Postgres defaults RLS **off** on new tables, and Supabase can enable RLS via the dashboard (not tracked in Drizzle). So the live DB is the source of truth. **Run:**
     ```sql
     SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
     ```
   - **Why it's potentially CRITICAL:** the anon key is `NEXT_PUBLIC_*` (shipped to every browser). If RLS is off, anyone can query/write any table directly through Supabase PostgREST with that key, **bypassing every app-layer guard**. The server's service-role client bypasses RLS by design (correct), so enabling RLS does not break server code.
   - RLS on (deny-by-default) for all data tables → close as LOW, document it.
   - RLS off on any data table → **CRITICAL**; enable RLS + deny-by-default policies (service role bypasses) in this branch or an immediate fast-follow before other work ships.
6. **Tests** (`route.test.ts`): wrong `currentPassword` → 401/403, no update; correct → 200 + password update + `revokeUserSessions` called; demotion path calls `revokeUserSessions`.

**Acceptance:** password change requires correct current password; on success the old refresh tokens are revoked (verified); demotion revokes the target's sessions; RLS posture is known and documented (enabled or remediated); tests pass.

---

## Branch 2 — Entry-type slice (Part 3, trimmed per review O3) `[S]`

**Goal:** kill the real bug class — the `as any` cluster on entry rows — with the minimum surface. The full per-domain `types/` reorg is **deferred to opportunistic follow-up** (do not churn 8 type files up front; let them follow only where they pay).

1. Create **only** `lib/types/entry.ts` now: discriminated `EntryRow` union (`type: 'labour'|'material'|'machinery'|'expense'|'incident'`) derived from Drizzle `$inferSelect` per table; export `entryOwnerId(entry: EntryRow): string | null` (`createdBy ?? reportedBy ?? null`). *(Fixes A3 in its worst file, A4.)*
2. Refactor [entries/[id]/route.ts](app/api/entries/[id]/route.ts) to use `EntryRow` + `entryOwnerId` — remove the `(existing as any)` accesses there.
3. **C2 (both sites)** — add `ROLES_TUPLE: readonly [Role, ...Role[]]` to [lib/auth/roles.ts](lib/auth/roles.ts); replace `z.enum(ALL_ROLES as unknown as …)` at **[users/route.ts:18](app/api/admin/users/route.ts#L18) and [role/route.ts:22](app/api/admin/users/[id]/role/route.ts#L22)** (the audit cited one; there are two).
4. **Deferred (separate, opportunistic):** `lib/types/{user,site,request,transfer,form,api,audit}.ts` + barrel — move a shared shape only when a second consumer appears or a file is already being touched. Component-local one-off prop types stay co-located. No big-bang migration.

**Acceptance:** `entry.ts` imported by `entries/[id]`; `as any` in that file → 0; both `z.enum` casts replaced; typecheck green. No other files moved unless touched anyway.

---

## Branch 3 — `lib/services/` extraction, duplication-driven (Part 4, reframed per review O1) `[M]`

**Goal:** extract logic that is **reused or worth testing in isolation** — not chase a line count. (Per O1: a cohesive 120-LOC handler is fine; shredding it to hit a number is KISS-in-reverse.) `lib/services/` already exists and stays the home. Depends on Branch 2's `EntryRow`.

1. **`entries.ts`** — the clear win: `coerceDecimals(obj, keys)` helper (reused by sites/transfers — fixes A1's 12× duplication), split-labour rules, material-unit resolution, archived-site check moved out of [entries/[id]/route.ts](app/api/entries/[id]/route.ts). Route becomes guard → parse → `entriesService.update(...)` → respond.
2. **`users.ts`** — provision + role-change orchestration extracted (testable without HTTP; pairs with the RBAC stateful checks).
3. **Extract elsewhere only where it pays:** `forms` similar-merge logic is shared between category/subcategory → extract. A handler that's long but linear and single-use → leave it.
4. **Heuristic, not a gate:** length is a smell to investigate, not a threshold to enforce. Target the **duplication** (A1) and the **testability** (services), not the LOC.
5. **Tests:** unit-test extracted services directly. Keep existing route tests green.

**Acceptance:** `coerceDecimals` is a single shared definition (A1 closed); entries + users logic unit-tested without HTTP; existing route tests green; no handler split purely to reduce line count.

---

## Branch 4 — Client data layer + snappiness (P2, P3, P4, P5) `[L]`

**Goal:** native-feel perceived performance. **Measure first.**

1. **Step 0 — RUM:** add `web-vitals`; report `onLCP/onINP/onCLS` to PostHog. Record baseline numbers in the PR.
2. **P2 — SWR** (recommended over React Query for size): wrap `requestJson` GETs in `useSWR` across the 18 client fetch sites. Add optimistic mutations **for entries and transfers only** (`mutate` + rollback on error). **Do NOT make role-change optimistic** (review O2): the server is the authority — the last-admin guard + stateful actor recheck can legitimately reject it, and [users/page.tsx:44-63](app/app/admin/users/page.tsx#L44-L63) already does the correct pessimistic flow (await → set from `res.data` → resync on error). Leave it; same rule for any privilege/auth-state write. Pairs with the SW's existing SWR API cache.
3. **P3 — code-split:** `next/dynamic` for `OperationDetailPageClient`, `DynamicEntryForm`, any modal/chart; lazy-load `motion` where a CSS transition suffices.
4. **P4 — memoize:** `useMemo`/`memo` list rows + derived stats in the large client pages; stabilize object/callback props.
5. **P5 — skeletons:** add `loading.tsx` to remaining data routes.
6. **Verify:** re-measure web-vitals; INP ≤200ms, LCP ≤2.5s; record before/after.

**Acceptance:** before/after vitals in PR; revisiting a screen renders cached data instantly then revalidates; bundle for heavy routes shrinks.

---

## Branch 5 — A11y + native polish (U1, PWA1, U2, U3, U4) `[M]`

1. **U1** — `useReducedMotion()` guard on all `motion/react` usage (8 files) + global `@media (prefers-reduced-motion: reduce)` fallback in `globals.css`.
2. **PWA1** — `viewport` in [app/layout.tsx](app/layout.tsx#L39): add `viewportFit: "cover"`. Verify `.safe-area-*` utilities now apply on a notched device in standalone.
3. **U2** — add `aria-label` to icon-only buttons (audit the 58 vs 14 gap).
4. **U4** — bump interactive controls to ≥44px (`h-11`+); raise `text-[9px]/[10px]` labels to ≥11–12px or confirm decorative.
5. **U3** — converge auth pages onto the semantic token system (`on-surface`/`surface-container`/`outline`/`primary`); retire raw `slate-*` in `app/auth/*`.

**Acceptance:** reduced-motion respected; safe-area insets non-zero in standalone; Lighthouse a11y ≥95.

---

## Branch 6 — Toast UX (Part 6) `[S]`

1. `lib/ui/toastMessages.ts` — `ERROR_CODES → friendly copy` map + generic fallback.
2. `lib/http/client.ts` (or `lib/ui/toast.ts`) — `notifyError(result)` looks up by `result.code`; never surfaces raw `message`.
3. Replace the ~15 `toast.error(res.message)` and raw `toast.error(err)` / `signInError.message` sites with `notifyError`.
4. Standardize success copy (verb + noun).

**Acceptance:** no toast shows a raw backend/DB/code string; grep for `toast.error(res.message` → 0.

---

## Branch 7 — PWA completion (PWA2, PWA3, PWA5) `[M]`

1. **PWA2** — `app/~offline/page.tsx` branded offline screen; register as serwist navigation fallback in [app/sw.ts](app/sw.ts).
2. **PWA3** — `beforeinstallprompt` capture + dismissible "Install" affordance + `appinstalled` cleanup; iOS A2HS hint.
3. **PWA5** — `manifest.json`: add `shortcuts` (New Log, Transfers), `screenshots` (narrow+wide), `display_override`.

**Acceptance:** offline navigation lands on the offline page; install button appears when installable; Lighthouse PWA installable checks pass.

---

## Branch 8 — Remaining hardening (C1, S2–S5, C3, P6) `[M]`

*(D1/RLS moved to Branch 1 per review — binary unknown, verify first not last.)*

- **C1** — `AppHeader.tsx` prop → `Role`; capability checks for any access-relevant branch.
- **S2** — add stateful actor check to `GET /api/admin/users`; paginate `listUsers`. (Write-path half of S2 already handled by Branch 1's demotion revocation.)
- **S4** — first-admin seed `must_change_password = true`.
- **S5** — await auth before cache read in `sites/[id]` GET.
- **S3 (strengthened — GDPR)** — stop writing raw email into `audit_logs.metadata`. The `user.created` audit already carries the new user's id as `resourceId`; drop `email` from metadata and **join `actorUserId`/`resourceId` → auth.users at read time** instead. If any email must persist, document a 30-day retention/redaction policy. ([users/route.ts:145](app/api/admin/users/route.ts#L145))
- **C3 / P6** — change-password loop integration test; verify middleware matcher.

## Deferred / separate workstream
- **PWA4** background-sync outbox for offline entry/transfer POSTs `[L]`.
- **PWA6** web push (VAPID, subscriptions, opt-in) `[L]`.

---

## Dependency graph (canonical sequencing)
```
B1 (security + session revocation + RLS check)  ── independent, ship first [S]
   └─ includes S1, M1, M2(opt2), M3, D1/RLS verify
B2 (entry-slice types, trimmed)                  ── independent [S]
   └─ EntryRow + entryOwnerId + C2 (both z.enum sites)
B2 ──► B3 (services: entries/users, duplication-driven) [M]
B3 ──► parts of B4
B4 (client data layer: web-vitals → SWR → split → memoize) [L]
   └─ optimistic = entries/transfers ONLY (not role-change)
B5 (a11y + PWA1 viewport-fit + tokens)           ── independent [M]
B6 (toast friendly-copy map)                     ── independent [S]
B7 (PWA: offline, install, manifest)             ── independent [M]
B8 (hardening: C1, S2–S5, C3, P6)                ── independent [M]
Deferred: PWA4 background-sync [L], PWA6 web-push [L]
```
**Merge order: B1 → B2 → B3 → B5 → B6 → B4 → B7 → B8.** (B5/B6 are quick wins slotted between the heavier B3→B4. RLS verification inside B1 may escalate to a CRITICAL fast-follow if policies are off.)

---

## Changelog — external review responses (2026-06-10)
- **M1 (accepted, HIGH):** added session/refresh-token revocation after password change **and** on role demotion → Branch 1. Audit had only covered the read-path stale window (S2).
- **M2 (accepted, reframed):** change-password adopts **currentPassword re-auth (option 2)** — one endpoint serves forced-rotation + self-service; dropped the build-to-throw "gate-only" option.
- **M3 (accepted, minor):** raise password floor → Branch 1.
- **O1 (accepted):** Branch 3 reframed — extract for duplication/testability, **not** a LOC ceiling.
- **O2 (accepted):** role-change removed from optimistic scope (already correct/pessimistic; server is authority). Optimistic = entries/transfers only.
- **O3 (accepted):** Branch 2 trimmed to the entry-slice; full `types/` reorg deferred to opportunistic follow-up.
- **O4 (accepted):** collapsed to one canonical sequence (this graph); earlier lists marked as severity snapshots.
- **D1 (accepted):** RLS verification moved from Branch 8 (last) to Branch 1 (now) — binary unknown, cheap check, catastrophic if off.
- **C2 (accepted):** fix targets **both** `z.enum` sites (users/route.ts:18 + role/route.ts:22).
- **M2 framing — partial pushback:** "throwaway" overstated since self-service change may never have been a requirement in a closed system; option 2 adopted regardless because it strictly dominates.
- **Capability model:** review confirms clean — no change.

### Changelog — review round 2 (2026-06-10)
- **D1/RLS (accepted conclusion, corrected evidence + severity↑):** verified no migration enables RLS/policies anywhere. **Pushback:** the cited `0006 DISABLE` lines are legacy Better Auth tables (removed in `0005`), not the core domain tables — not valid evidence about them. Migrations can't confirm RLS (Supabase dashboard manages it out-of-band), so the live `pg_tables` query is the arbiter. Added the exact query + the real exposure (public `NEXT_PUBLIC` anon key → direct PostgREST bypass). Part-2 D1 upgraded MED→HIGH/CRITICAL-pending-query; Branch 1 RLS step expanded.
- **S3 (strengthened):** drop raw email from `audit_logs.metadata`; join `actorUserId`/`resourceId` at read time; 30-day retention if email must persist → Branch 8.
- **S1, S2, S5, A1, A3/A4, Part-4 services, P2/optimistic-scope, U1, PWA1/2/3:** review concurs with the existing plan — no changes.
