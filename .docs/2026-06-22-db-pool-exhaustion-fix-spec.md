# Spec: DB connection-pool exhaustion — durable fix + query optimization

**Date:** 2026-06-22
**Status:** Implemented & verified 2026-06-22
**Supersedes planning in:** `2026-06-22-db-pool-exhaustion-handoff.md`

## Outcome (2026-06-22)

- **Root cause of the cure's earlier failure found:** the Supavisor transaction pooler
  ignores BOTH client startup `statement_timeout` AND role-level
  `ALTER ROLE ... SET statement_timeout` — proven empirically (pooled session keeps
  reporting `2min`, `source=configuration file`). Only `SET LOCAL` inside a transaction
  survives. The role-level ALTER was applied then reverted.
- **Fix 1 (corrected):** `withStatementTimeout` (`lib/db/guard.ts`) wraps heavy reads in a
  transaction with `SET LOCAL statement_timeout = 15s`. Reaps orphaned queries → pool
  self-heals. Applied to catalog, dashboard, operation-summary.
- **Fix 2:** catalog usage counts collapsed from 7 parallel group-by queries to one
  `UNION ALL` (`lib/catalog/overviewQuery.ts`); route fan-out 9 → 3.
- **Fix 3 (cancel-on-abort): SUPERSEDED.** postgres.js `.cancel()` races connection
  setup on early/cold aborts (proven twice) — unreliable as a primary cure. The working
  `SET LOCAL` timeout (Fix 1) reaps orphans regardless, achieving the same goal.
- **Part B:** `getSiteTrackedSpend` (4 queries → 1 SQL SUM), `getSiteOperationSummary`
  (5 queries → 1 SQL COUNT/SUM), dashboard (active+archived sites → 1 scan). Equivalence
  vs the old row-based math proven by integration tests.
- **Verification:** full suite **246 tests pass** (incl. 7 new DB integration tests);
  `tsc` clean; catalog route returns clean 401 in ~2.5ms; **pool-wedge reproduced and
  fixed** at the pool layer — a follow-up query starved >8s without the guard, answered in
  44ms with it.
- **Analytics risk gate:** cleared — 7 indexed `count(*)`, cached 60s, sub-second, and not
  wrapped by the guard, so unaffected. Migrations unaffected (timeout is per-app-query).

---

## Problem

`/app/admin/catalog` (and `/api/dashboard`) hang forever on "Loading catalog…". Root
cause is proven (see handoff): **DB connection-pool exhaustion via orphaned queries.**

Chain: per-request query fan-out (catalog fires ~9 in parallel) against a small pool →
aborted HTTP requests orphan in-flight postgres.js queries (Node never cancels them) →
each orphan permanently pins a pool slot → slots run out → every later query waits on a
slot that never frees → infinite hang → more user refreshes → more orphans → death spiral.

The app-side guard (`connection.statement_timeout`) is **ineffective**: Supabase's
Supavisor transaction pooler (`:6543`) strips client startup parameters, so `SHOW
statement_timeout` stays at the pooler default (`2min`). Only a **server-side** setting
survives the pooler.

## Goal

Stop the freeze durably and make DB calls quick and safe:
1. Reap orphaned/overrunning queries server-side so the pool self-heals.
2. Cut peak connection demand by removing unnecessary query fan-out.
3. Prevent orphans from forming by cancelling queries when the HTTP request aborts.
4. Optimize underperforming queries that pull full row sets into JS to aggregate.

## Non-goals

- Switching DB provider (Convex/Mongo/Neon) — rejected; bug is app-side, not provider-side.
- Dedicated least-privilege app role (Option B) — deferred to a separate follow-up.
- Rewriting routes that already fetch real rows under a bounded `limit`.

---

## Part A — Stop the death spiral

### Fix 1 — per-statement `statement_timeout` via `SET LOCAL` (mechanism corrected 2026-06-22)

**Discovery during implementation:** the originally-planned `ALTER ROLE postgres SET
statement_timeout` is **also ineffective through the Supavisor transaction pooler.** Proven
empirically:
- `ALTER ROLE` persists in the catalog (`pg_roles.rolconfig` shows `statement_timeout=30s`),
  but a pooled session still reports `current_setting('statement_timeout')` = `2min` with
  `pg_settings.source = 'configuration file'`. The pooler does not apply the role default.
- This overturns the handoff's premise that "role-level is the only knob that survives the
  pooler." Neither startup params nor role defaults survive.

**What works (proven):** `SET LOCAL statement_timeout` issued *inside an explicit
transaction* sticks on the pooled backend and enforces the limit — a `pg_sleep(5)` under
`SET LOCAL statement_timeout='1500ms'` was cancelled at ~1.8s with `57014 canceling
statement due to statement timeout`.

**Decision:** apply the timeout as a per-statement guard on the **heavy read endpoints
only** (catalog, dashboard, operation-summary), via a `SET LOCAL` transaction wrapper. Point
queries elsewhere rely on Fix 3 (cancel-on-abort) plus being fast. The role-level ALTER was
applied then **reverted** (it never worked through the pooler and would have capped
direct-connection migrations at 30s).

- **Backstop role shifts:** Fix 3 (cancel-on-abort) becomes the PRIMARY orphan-prevention
  cure; the `SET LOCAL` timeout is the secondary net for orphans that escape a clean abort
  (e.g. dropped connections).
- **Risk gate (still relevant):** the Analytics raw query
  (`app/api/admin/analytics/route.ts:46`) is the only candidate to legitimately exceed the
  limit. It is 7 indexed `count(*)` subqueries, cached 60s — sub-second, well under 30s, and
  it is NOT wrapped by the heavy-endpoint guard, so it is unaffected regardless.
- **Migrations:** unaffected — the timeout is applied only to specific app queries, never to
  the migration path.

### Fix 2 — collapse catalog fan-out 9 → 1

`app/api/admin/catalog/route.ts` currently issues, per request:
- 1 categories select
- 1 subcategories select
- 7 group-by usage-count queries (from `lib/catalog/usageSources.ts`)

Rewrite as a **single round-trip**: combine the 7 usage counts into one query via
`UNION ALL` of per-source `SELECT categoryName, value, count(*)`, and fetch
categories + subcategories in the same statement via CTEs (or, acceptably, at most 2
round-trips total). Reduces peak pool demand per catalog load from ~9 slots to 1.

Preserve the existing output contract (`buildCatalogOverview` input shape:
`categories`, `subcategories`, `usageBySubcategoryId`). The mapping from
`(categoryName -> value -> count)` to `subcategoryId` stays in JS.

### Fix 3 — cancel queries on request abort (true cure)

Tie `request.signal` to postgres.js query cancellation so an aborted HTTP request actively
cancels its in-flight query instead of orphaning it.

- Implement as a **single wrapper** threaded through `lib/http/withApi.ts` (the common
  entry for API routes), not per-route edits.
- On `request.signal` `abort`, call the underlying postgres.js query `.cancel()` (or abort
  the reserved connection) so the server backend is freed immediately.
- Isolated unit with its own test (see Part C). This is the most invasive change; it must
  not alter the success-path behavior of any route.

### Pool config cleanup (`lib/db/client.ts`)

- **Keep:** `max: 15`, `idle_timeout: 120`, `connect_timeout: 10`, `prepare: false`.
- **Remove:** the dead `connection.statement_timeout: 15_000` line — proven ineffective
  through the pooler and misleading to future readers. Replace its comment with a short
  note pointing to the role-level timeout (Fix 1) as the real guard.

---

## Part B — Optimize underperforming queries

Audit finding: three spots pull **entire row sets into JS purely to count/sum**. Convert to
SQL aggregates so the DB returns a few numbers, not N rows.

| Location | Current | Target |
|----------|---------|--------|
| `lib/db/queries/sites.ts:46` `getSiteTrackedSpend` | 4 queries, each fetches **every** entry row for a site, sums in JS. Unbounded growth. | SQL `SUM` per type; 1 combined round-trip returning 4 totals. Math must match `calculateSiteTrackedSpend`. |
| `lib/db/queries/entries.ts:500` `getSiteOperationSummary` | 5 queries fetch all of today's rows, count+sum in JS. | SQL `count` + `sum` per type, combined to 1 round-trip. Must reproduce `calculateLabourTotal` / `calculateMachineryTotal` semantics in SQL (or keep per-row calc only where the formula can't be expressed in SQL — document the choice). |
| `lib/services/dashboard.ts:54` `getDashboardData` | 3 queries; active + archived sites are two scans of the same table. | Fetch sites once, partition active/archived in JS. 3 → 2 round-trips. |

**Leave alone (already correct):**
- `getEntriesBySite` `"all"` branch — needs real rows, bounded by `limit`.
- `app/api/notifications/route.ts` list+count — small, bounded.
- `app/api/admin/analytics/route.ts` raw SQL — already a single aggregate query; subject to
  the Fix-1 risk gate, not a rewrite.

**Constraint:** every rewritten query keeps the exact same return shape and numeric results
as the code it replaces. Proven by Part C unit tests on seeded data.

---

## Part C — Testing

1. **Repro / regression test (the proof):** fire ~15 concurrent `/api/admin/catalog`
   requests, each aborted at ~1s. Assert the pool does **not** wedge — a follow-up catalog
   request still completes within a few seconds. This must be **red before Fix 1/3, green
   after.** Inspect `pg_stat_activity` for lingering
   `application_name='Supavisor' AND state='active' AND wait_event='ClientRead'` backends.
2. **Abort-cancel unit test (Fix 3):** start a query, abort the request mid-flight, assert
   the backend is cancelled (no orphan left in `pg_stat_activity`).
3. **Query-equivalence unit tests (Part B):** on seeded data, assert each rewritten
   aggregate query returns identical numbers/shape to the old row-based implementation.
4. **Manual:** load `/app/admin/catalog` 10× in rapid succession with reloads → no freeze;
   confirm catalog response time is sub-second.

## Rollout / reversibility

- Fix 1 is a one-line `ALTER ROLE`, reverted with `RESET`. Apply only after the Analytics
  risk gate clears.
- Fixes 2, 3 and Part B are code; land behind the existing test suite.
- If anything regresses, `RESET` the role timeout and revert the wrapper independently of
  the query rewrites.

## Key files

- `lib/db/client.ts` — pool config cleanup.
- `lib/http/withApi.ts` — Fix 3 abort→cancel wrapper.
- `app/api/admin/catalog/route.ts`, `lib/catalog/usageSources.ts` — Fix 2.
- `lib/db/queries/sites.ts`, `lib/db/queries/entries.ts`, `lib/services/dashboard.ts` — Part B.
- `app/api/admin/analytics/route.ts` — Fix-1 risk gate only.
- New: one-shot script to apply/verify the role `statement_timeout`.
