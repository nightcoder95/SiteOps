# Phase 2 — Catalog performance hotspot & API route hygiene

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the one server query whose cost grows linearly with total data volume across all sites, stop the client refetching it after every keystroke-level mutation, and retire the ~120 lines of copy-pasted preamble that every future entry route would otherwise inherit.

**Architecture:** Two independent halves. (A) Cache the catalog overview behind the repo's existing `getOrSetJson` + explicit invalidation on the four catalog write routes, and replace blanket `mutate()` refetches with SWR optimistic updates. (B) Extract `assertSiteWritable` (kills the ×4 site-lookup block) and `withAuthedApi` (kills the 3-line auth narrowing repeated in 59 route files), converting one route at a time behind its existing test.

**Tech stack:** Next 16 route handlers, drizzle-orm, Upstash Redis via `lib/cache/*`, SWR 2, vitest 3.

**Covers audit findings:** F6, F8.

---

## Global constraints

Read [README.md § Global constraints](README.md#global-constraints-apply-to-every-phase-every-task). Phase-specific traps:

- **`getOrSetJson`'s real signature** (the audit's is wrong):
  ```ts
  getOrSetJson<T>(requestId: string, key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<{ value: T; hit: boolean }>
  ```
  It returns `{ value, hit }`, not the value. It degrades gracefully when `redis` is `null` (dev/no env) by calling `compute()` directly — that path must keep working.
- **Invalidation helpers live in `lib/cache/invalidate.ts` and are called through `runNonCritical(requestId, "<event_name>", promise)`.** The event-name string is logged and asserted — never rename an existing one.
- **`withStatementTimeout` must keep wrapping the catalog read.** It is the fix for a real production pool-freeze (`app/api/admin/catalog/route.ts:18` comment). Caching goes *outside* it, never replaces it.
- **The `×4` site-block has one deliberate asymmetry:** the ownership-failure message is entry-specific ("You can only log entries for sites you supervise"). Parameterise the message; do not genericise it or the route tests fail.
- Run tests as `npm run test -- --testTimeout=30000` — `lib/catalog/overviewQuery.test.ts` is DB-backed and flakes at 5 s.

---

## Pre-flight

- [ ] **P0.1** Phase 1 is merged (Task 6 rewrote `app/api/entries/materials/route.ts`, which Task 8 below also edits).
- [ ] **P0.2** Clean tree, green baseline:
  ```bash
  git status --short && npm run lint && npm run test -- --testTimeout=30000 2>&1 | tail -20
  ```
- [ ] **P0.3** `git checkout -b phase-2-catalog-perf-and-routes`.
- [ ] **P0.4** Read `git show d29ba8a -- components/catalog/CatalogManager.tsx` if that commit exists in this history — `CatalogManager` was previously refactored for a double-fetch bug and Task 4 touches its SWR wiring. If the SHA is not in this repo's history, skip; do not hunt for it.

---

## Part A — the catalog aggregate (F6)

### What is actually slow (verified 2026-08-06)

`GET /api/admin/catalog` calls `fetchUsageCounts` (`lib/catalog/overviewQuery.ts:21-30`), which builds one `UNION ALL` of `select … count(*) … group by <col>` — **one branch per entry in `USAGE_SOURCES`, which today has 10 entries, not the 7 the audit states** (`lib/catalog/usageSources.ts:19-30`: Labour, Materials, Work Stage ×4 tables, Machinery/Equipment, Expense Category, Incident Type, Incident Severity). Each branch is a full sequential scan of an entry table with **no `site_id` predicate**, grouping on columns (`work_type`, `material_type`, `work_stage`, `equipment_type`, `category`, `incident_type`, `severity`) that are the schema's only unindexed WHERE/GROUP columns.

Cost therefore grows with *total entries across all sites, forever*. `CatalogManager` then calls `mutate()` — a full refetch of this aggregate — after every toggle (`:92`), rename (`:104`→`:92`), reorder (`:129`), merge (`:147`) and create (`:190`). A single drag-reorder fires **two sequential PATCHes plus the full aggregate refetch**.

**Safe to cache — verified.** Nothing makes an authorization or integrity decision on these counts. The delete-guard that blocks removing an in-use option runs its **own live** count queries inside `DELETE /api/forms/subcategories/[id]` (`:136-152`), not against this route. The counts here are display-only ("Used 42 times"), so bounded staleness is acceptable.

**Deliberate non-goal:** entry creation also changes these counts. We do **not** invalidate the catalog cache from the five entry POST routes — that would add a Redis round-trip to the app's hottest write path to keep a display-only number fresh. The TTL covers it.

---

### Task 1 — Cache key + invalidation helper

**Files:**
- Modify: `lib/cache/keys.ts`
- Modify: `lib/cache/invalidate.ts`
- Create: `lib/cache/catalogOverview.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function catalogOverviewCacheKey(): string;              // lib/cache/keys.ts
  export async function invalidateCatalogOverviewCache(requestId: string): Promise<void>;  // lib/cache/invalidate.ts
  ```
  Tasks 2 and 3 consume both.

- [ ] **Step 1: Write the failing test**

Create `lib/cache/catalogOverview.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { catalogOverviewCacheKey } from "./keys";

describe("catalogOverviewCacheKey", () => {
  it("is a single global key — the overview is not per-user or per-site", () => {
    expect(catalogOverviewCacheKey()).toBe("admin:catalogOverview");
  });

  it("is stable across calls", () => {
    expect(catalogOverviewCacheKey()).toBe(catalogOverviewCacheKey());
  });
});
```

The "not per-user" assertion is load-bearing: the overview response contains no user-scoped data (verified — it is categories + subcategories + usage counts), so a shared key is correct. If a future change adds user-scoped fields to that response, this test's comment is the reason to split the key.

- [ ] **Step 2: Run — expect FAIL**

```bash
npm run test -- --testTimeout=30000 lib/cache/catalogOverview.test.ts
```

- [ ] **Step 3: Implement**

Append to `lib/cache/keys.ts`:
```ts
export function catalogOverviewCacheKey() {
  return `admin:catalogOverview`;
}
```

In `lib/cache/invalidate.ts`, add `catalogOverviewCacheKey` to the existing import from `@/lib/cache/keys`, then append:
```ts
export async function invalidateCatalogOverviewCache(requestId: string) {
  const r = redis;
  if (!r) return;

  try {
    await r.del(catalogOverviewCacheKey());
  } catch (error) {
    logWarn(requestId, "cache_invalidate_error", {
      key: catalogOverviewCacheKey(),
      error: String(error),
    });
  }
}
```
This mirrors `invalidateCategoryListCache` exactly — same null guard, same `logWarn` event name, same swallow-and-continue posture.

- [ ] **Step 4: Run — expect PASS.** `npm run test -- --testTimeout=30000 lib/cache/catalogOverview.test.ts`

- [ ] **Step 5: Commit**
```bash
git add lib/cache/keys.ts lib/cache/invalidate.ts lib/cache/catalogOverview.test.ts
git commit -m "feat(cache): add catalog-overview cache key and invalidation helper"
```

---

### Task 2 — Cache the route

**Files:**
- Modify: `app/api/admin/catalog/route.ts`
- Create: `app/api/admin/catalog/route.test.ts`

**Interfaces:**
- Consumes: `catalogOverviewCacheKey`, `getOrSetJson`.
- Produces: no new exports; the response body shape is **unchanged** (`{ operations }`).

**TTL: 60 seconds.** Matches `admin/analytics/route.ts:32-36`, which is the sibling precedent. Worst case, an admin sees another admin's rename up to 60 s late — and explicit invalidation (Task 3) makes even that rare, since it only applies to writes we do not catch (entry creation).

- [ ] **Step 1: Write the failing test**

Create `app/api/admin/catalog/route.test.ts`. Copy the mocking scaffolding from `app/api/admin/catalog/merge/route.test.ts` (same directory, same auth guard style) — do not invent a new one. Cases:

```ts
// 1. cache MISS: getOrSetJson's compute runs → withStatementTimeout is called →
//    response body equals { operations: [...] } and status 200.
// 2. cache HIT: getOrSetJson returns { value, hit: true } without invoking
//    compute → withStatementTimeout is NOT called, body is identical to (1).
// 3. redis unavailable (getOrSetJson falls through to compute): still 200 with
//    the computed body — the dev path must not break.
// 4. unauthorized (requireCapability fails): the guard's error code/status is
//    returned and getOrSetJson is NEVER called (do not warm a cache for a
//    request that is not allowed to read it).
// 5. the cache key used is exactly catalogOverviewCacheKey().
// 6. the TTL passed is 60.
```

Case 4 is a security assertion, not a perf one — assert it explicitly.

- [ ] **Step 2: Run — expect FAIL** (`getOrSetJson` is not yet called).

- [ ] **Step 3: Implement**

Rewrite `app/api/admin/catalog/route.ts`'s handler body. The auth guard stays **outside** the cache; everything from `withStatementTimeout` through `buildCatalogOverview` moves **inside** `compute`:

```ts
import { getOrSetJson } from "@/lib/cache/getOrSetJson";
import { catalogOverviewCacheKey } from "@/lib/cache/keys";
// …existing imports unchanged

export const GET = withApi(async ({ request, requestId }) => {
  const auth = await requireCapability(request, "site:read_all");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
  }

  // The usage aggregate is a full scan of every entry table with no site
  // predicate, so its cost grows with total data volume forever. It is
  // display-only (the delete-guard runs its own live counts), so a short TTL is
  // safe. Invalidated explicitly on catalog writes; entry writes just age out.
  const { value: overview } = await getOrSetJson(
    requestId,
    catalogOverviewCacheKey(),
    60,
    async () => {
      // statement_timeout guard stays INSIDE compute — it is the pool-freeze
      // fix and must wrap the query itself, not the cache lookup.
      const { categoryRows, subcategoryRows, usageByName } = await withStatementTimeout(
        async (tx) => {
          const [categoryRows, subcategoryRows, usageByName] = await Promise.all([
            tx.select({ categoryId: categories.categoryId, name: categories.name }).from(categories),
            tx
              .select({
                subcategoryId: subcategories.subcategoryId,
                categoryId: subcategories.categoryId,
                name: subcategories.name,
                isActive: subcategories.isActive,
                sortOrder: subcategories.sortOrder,
              })
              .from(subcategories),
            fetchUsageCounts(tx),
          ]);
          return { categoryRows, subcategoryRows, usageByName };
        },
      );

      const categoryNameById = new Map(categoryRows.map((c) => [c.categoryId, c.name]));
      const usageBySubcategoryId: Record<string, number> = {};
      for (const sub of subcategoryRows) {
        const catName = categoryNameById.get(sub.categoryId);
        if (!catName) continue;
        usageBySubcategoryId[sub.subcategoryId] = usageByName.get(catName)?.get(sub.name) ?? 0;
      }

      return buildCatalogOverview({
        categories: categoryRows,
        subcategories: subcategoryRows,
        usageBySubcategoryId,
      });
    },
  );

  return successResponse({ operations: overview }, 200, requestId);
});
```

**Serialisation edge case — the one thing that can silently break this.** `fetchUsageCounts` returns a `Map<string, Map<string, number>>`. `JSON.stringify(new Map())` is `{}`, so a `Map` **cannot** cross the Redis boundary. In the code above the `Map` never does: it is consumed inside `compute`, and only `buildCatalogOverview`'s plain-object/array output is cached. **Do not "simplify" by caching the `{ categoryRows, subcategoryRows, usageByName }` tuple instead** — that would cache an empty `{}` for `usageByName` and every usage count would read 0 on a cache hit. Test case 2 above (hit body identical to miss body) is what catches this; keep it.

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Prove the hit path really skips the query (manual, with Redis env set)**

```bash
npm run dev
# hit the admin catalog screen twice, then:
grep -c "cache_miss" <dev log>   # 1 for the first load
grep -c "cache_hit"  <dev log>   # ≥1 for the second
```
`getOrSetJson` already emits `cache_hit` / `cache_miss` structured logs keyed by `key` (`lib/cache/getOrSetJson.ts:19,23`) — no new instrumentation needed.

- [ ] **Step 6: Commit**
```bash
git add app/api/admin/catalog/route.ts app/api/admin/catalog/route.test.ts
git commit -m "perf(catalog): cache the admin catalog overview aggregate for 60s"
```

---

### Task 3 — Invalidate on every catalog write

**Files:**
- Modify: `app/api/forms/subcategories/route.ts` (POST — create)
- Modify: `app/api/forms/subcategories/[id]/route.ts` (PATCH — rename/toggle/reorder; DELETE)
- Modify: `app/api/admin/catalog/merge/route.ts` (POST — merge)
- Modify: `app/api/forms/categories/route.ts` and `app/api/forms/categories/[id]/route.ts` (category create/edit — they change the overview's grouping)

**Correction to the audit:** it says to grep for `invalidateCategoryListCache` to find the write routes. That finds only the two **categories** routes — the subcategory routes invalidate `invalidateCategoryTreeCache` instead, and the merge route likewise. The complete verified list of routes that mutate what `GET /api/admin/catalog` returns is the five files above.

- [ ] **Step 1: Write the failing tests**

For each route that already has a test file (`app/api/forms/subcategories/[id]/route.test.ts`, `app/api/admin/catalog/merge/route.test.ts`), add one case:

```ts
it("invalidates the catalog overview cache on success", async () => {
  // assert invalidateCatalogOverviewCache was called with the requestId,
  // via runNonCritical with event name "catalog_overview_cache_invalidation_failed"
});

it("does NOT invalidate when the write fails", async () => {
  // 404 / 409 path → no invalidation call
});
```

For routes with **no** test file (`subcategories/route.ts` POST, `categories/route.ts`, `categories/[id]/route.ts`), do not create full route tests here — that is Phase 4's F11 work. Instead add one grep-based assertion to `lib/cache/catalogOverview.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";

describe("catalog overview invalidation coverage", () => {
  // Every route that mutates what GET /api/admin/catalog returns must clear the
  // cache, or admins stare at stale usage counts for up to a TTL after their
  // own edit. Grep-level because three of these routes have no route test yet
  // (see Phase 4 / F11).
  const writeRoutes = [
    "app/api/forms/subcategories/route.ts",
    "app/api/forms/subcategories/[id]/route.ts",
    "app/api/admin/catalog/merge/route.ts",
    "app/api/forms/categories/route.ts",
    "app/api/forms/categories/[id]/route.ts",
  ];

  it.each(writeRoutes)("%s invalidates the catalog overview cache", (rel) => {
    const source = readFileSync(path.resolve(__dirname, "..", "..", rel), "utf8");
    expect(source).toContain("invalidateCatalogOverviewCache");
  });
});
```

- [ ] **Step 2: Run — expect FAIL** on all five grep assertions.

- [ ] **Step 3: Add the invalidation call to each route**

In every one of the five files, find the existing `runNonCritical(...)` invalidation block on the **success** path and add a sibling call. Example, in `app/api/forms/subcategories/[id]/route.ts` PATCH (currently around `:84`):

```ts
  runNonCritical(
    requestId,
    "category_tree_cache_invalidation_failed",
    invalidateCategoryTreeCache(row.categoryId, requestId),
  );
  runNonCritical(
    requestId,
    "catalog_overview_cache_invalidation_failed",
    invalidateCatalogOverviewCache(requestId),
  );
```

Rules that matter:
- **New event name only.** `"catalog_overview_cache_invalidation_failed"` is new; never reuse or rename `"category_tree_cache_invalidation_failed"` — existing logs and assertions depend on it.
- **Success path only.** Put the call after the write succeeded, never before, and never on an error return.
- **Same transaction boundary.** `runNonCritical` is fire-and-forget by design (`lib/services/nonCritical.ts`); a Redis failure must not fail the write. Do not `await` it.
- The subcategories `[id]` route has **two** success paths (PATCH at `:87`, DELETE at `:171`) — both need it.
- The subcategories POST route has **two** returns (the duplicate short-circuit at `:93` and the created path at `:211`). The duplicate path did not write anything, so it needs **no** invalidation. Only the created path gets it.

- [ ] **Step 4: Run — expect PASS.** `npm run test -- --testTimeout=30000 lib/cache lib/catalog app/api/forms app/api/admin`

- [ ] **Step 5: Commit**
```bash
git add app/api/forms/subcategories app/api/forms/categories app/api/admin/catalog lib/cache/catalogOverview.test.ts
git commit -m "fix(catalog): invalidate the overview cache on every catalog write"
```

---

### Task 4 — Optimistic client updates instead of blanket refetch

**Files:**
- Modify: `components/catalog/CatalogManager.tsx`

**The waste:** four call sites (`:92`, `:129`, `:147`, `:190`) call `mutate()` with no argument, which re-runs the whole cached-but-still-expensive aggregate over the network for a change the client already knows the shape of.

**The rule for this task:** use SWR's optimistic form for changes whose result the client can compute (toggle, rename, reorder). Keep the full `mutate()` for changes it cannot (create — the server assigns the id and may return a review-pending state; merge — usage counts move between rows). Getting greedy here is how you ship a UI that disagrees with the database.

- [ ] **Step 1: Add a typed local mutator**

Near the top of the component, after the `useApiResult` line:

```ts
// Apply a change to the cached overview without refetching. `revalidate: false`
// is deliberate: the server response for these PATCHes carries no information
// the client does not already have, and the underlying aggregate is expensive.
async function applyLocal(update: (ops: CatalogOverview[]) => CatalogOverview[]) {
  await mutate(
    (current) =>
      current && current.ok
        ? { ...current, data: { ...current.data, operations: update(current.data.operations) } }
        : current,
    { revalidate: false },
  );
}
```

Match the real type names used by `OverviewResponse` in this file — read them before writing this; `CatalogOverview` above is a placeholder for whatever `result.data.operations`'s element type actually is.

- [ ] **Step 2: Toggle — optimistic with rollback**

Replace `toggleActive`:

```ts
async function toggleActive(item: CatalogItem) {
  const nextActive = !item.isActive;
  // Optimistic flip first so the row responds instantly on a slow site link.
  await applyLocal((ops) =>
    ops.map((op) => ({
      ...op,
      lists: op.lists.map((l) => ({
        ...l,
        items: l.items.map((i) =>
          i.subcategoryId === item.subcategoryId ? { ...i, isActive: nextActive } : i,
        ),
      })),
    })),
  );

  setBusyId(item.subcategoryId);
  const res = await requestJson(`/api/forms/subcategories/${item.subcategoryId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ isActive: nextActive }),
  });
  setBusyId(null);

  if (!res.ok) {
    notifyError(res);
    // Roll back by revalidating — the server is the truth and we just learned
    // our optimistic guess was wrong.
    await mutate();
    return;
  }
  toast.success(`${item.isActive ? "Deactivated" : "Activated"} "${item.name}"`);
}
```

- [ ] **Step 3: Rename — same shape**

Replace `submitRename` so it patches the name locally first, PATCHes, and `await mutate()` only on failure. Keep the `Promise<boolean>` return contract — `RenameModal` uses it to decide whether to close.

- [ ] **Step 4: Reorder — one request, optimistic swap**

Today's `reorder` fires two sequential PATCHes then a refetch: three round-trips for one arrow tap.

First check whether the PATCH route accepts a batch. Read `app/api/forms/subcategories/[id]/route.ts`'s PATCH schema:
```bash
sed -n '31,90p' app/api/forms/subcategories/\[id\]/route.ts
```
It is a **single-id** route, so a true batch needs a new endpoint. **Do not add one in this phase** — a new route is new API surface and needs its own auth/validation/test design. Instead:

1. Apply the swap optimistically (instant arrow response — this is where the felt latency is).
2. Fire the two PATCHes **in parallel** with `Promise.all` instead of sequentially, halving the wall time.
3. Drop the trailing `mutate()`; revalidate only on failure.

```ts
async function reorder(list: CatalogOverviewList, index: number, direction: -1 | 1) {
  const a = list.items[index];
  const b = list.items[index + direction];
  if (!a || !b) return;
  const aOrder = a.sortOrder;
  const bOrder = b.sortOrder === aOrder ? aOrder + direction : b.sortOrder;

  await applyLocal((ops) =>
    ops.map((op) => ({
      ...op,
      lists: op.lists.map((l) =>
        l.listKey !== list.listKey
          ? l
          : {
              ...l,
              items: l.items
                .map((i) =>
                  i.subcategoryId === a.subcategoryId
                    ? { ...i, sortOrder: bOrder }
                    : i.subcategoryId === b.subcategoryId
                      ? { ...i, sortOrder: aOrder }
                      : i,
                )
                // Re-sort locally so the row visibly moves; mirrors the server's
                // ordering (sortOrder asc, then name) — verify against
                // buildCatalogOverview before trusting this comparator.
                .sort((x, y) => x.sortOrder - y.sortOrder || x.name.localeCompare(y.name)),
            },
      ),
    })),
  );

  setBusyId(a.subcategoryId);
  const [ok1, ok2] = await Promise.all([
    requestJson(`/api/forms/subcategories/${a.subcategoryId}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sortOrder: bOrder }),
    }),
    requestJson(`/api/forms/subcategories/${b.subcategoryId}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sortOrder: aOrder }),
    }),
  ]);
  setBusyId(null);

  // Partial failure leaves the two rows inconsistent — revalidate so the UI
  // shows what the database actually holds rather than our optimistic guess.
  if (!ok1.ok || !ok2.ok) {
    notifyError(ok1.ok ? ok2 : ok1);
    await mutate();
  }
}
```

**Read `lib/catalog/overview.ts`'s `buildCatalogOverview` before writing the comparator** — the local sort must match the server's ordering exactly, or the row will jump on the next revalidation. Adjust `l.listKey` to whatever the real discriminating property on a list is.

**Known limitation, accepted:** `Promise.all` of two independent PATCHes is not atomic. If the second fails, the first has landed and two rows share a `sortOrder`. That is *already* true of today's sequential code, and the revalidate-on-failure path surfaces it. A transactional batch endpoint is the real fix and is out of scope; record it as a follow-up.

- [ ] **Step 5: Leave create and merge on full `mutate()`**

`makeCreate` (`:190`) and `submitMerge` (`:147`) keep `await mutate()`. Add a one-line comment at each explaining why, so the next reader does not "finish the job":

```ts
// Full revalidate: the server assigns the id and may return a review-pending
// state we cannot predict client-side.
await mutate();
```
```ts
// Full revalidate: a merge moves usage counts between rows — the client has no
// way to compute the resulting counts.
await mutate();
```

- [ ] **Step 6: Verify**

```bash
npm run lint && npm run test -- --testTimeout=30000
```

Manual, with the Network tab open on the admin catalog screen:
- Toggle a row → **one** PATCH, **zero** GETs of `/api/admin/catalog`. The row flips instantly.
- Rename a row → one PATCH, zero GETs.
- Move a row up → **two parallel** PATCHes, zero GETs, row moves immediately.
- Force a failure (stop the dev server mid-toggle, or temporarily return 500) → toast fires and the row snaps back to the server value.
- Create a new option → POST **plus** one GET (expected).
- Merge two options → POST plus one GET (expected), usage counts correct.

- [ ] **Step 7: Commit**
```bash
git add components/catalog/CatalogManager.tsx
git commit -m "perf(catalog): optimistic toggle/rename/reorder instead of full refetch"
```

---

### Task 5 — Decide on indexes (measurement, then maybe nothing)

**Files:** none by default.

The audit's step 4 is "if the aggregate stays hot after caching, add indexes on the grouped columns". **Measure before adding anything** — an index on a low-cardinality column like `work_stage` may not even be chosen by the planner for a full-table `GROUP BY`, and every index costs write throughput on the app's hottest tables.

- [ ] **Step 1: Measure the current cost**

Against a production-like dataset:
```sql
EXPLAIN (ANALYZE, BUFFERS)
select 'Labour'::text as category_name, "work_type"::text as value, count(*)::int as n
from "labour_entries" where "work_type" is not null group by "work_type";
```
Repeat for the other nine `USAGE_SOURCES` branches, or run the full UNION ALL that `fetchUsageCounts` builds.

- [ ] **Step 2: Record the numbers in this doc** (edit the table below and commit it):

**Measured 2026-08-06** against production (read-only session, `EXPLAIN (ANALYZE, BUFFERS)` on the exact UNION ALL `fetchUsageCounts` builds).

Table sizes: `labour_entries` 93, `material_entries` 34, `expense_entries` 69, `machinery_entries` 6, `incident_reports` 0.

| Branch | Rows scanned | Groups out | Time (ms) | Plan |
|---|---|---|---|---|
| labour_entries.work_type | 93 | 11 | 0.069 | Seq Scan → HashAggregate |
| material_entries.material_type | 34 | 8 | 0.025 | Seq Scan → HashAggregate |
| material_entries.work_stage | 34 | 5 | 0.021 | Seq Scan → HashAggregate |
| labour_entries.work_stage | 93 | — | — | Seq Scan → HashAggregate |
| machinery_entries.work_stage | 6 | 0 | 0.014 | Seq Scan → HashAggregate |
| expense_entries.work_stage | 69→3 | 1 | 0.035 | Seq Scan → Sort → GroupAggregate |
| machinery_entries.equipment_type | 6 | 2 | 0.014 | Seq Scan → HashAggregate |
| expense_entries.category | 69 | 2 | 0.038 | Seq Scan → HashAggregate |
| incident_reports.incident_type | 0 | 0 | 0.012 | Seq Scan → HashAggregate |
| incident_reports.severity | 0 | 0 | 0.008 | Seq Scan → HashAggregate |
| **Whole UNION ALL** | **202** | **30** | **0.615** | Append, `shared hit=18`, planning 0.651 ms |

**Decision: add no indexes.** Total execution is 0.615 ms — three orders of magnitude under the ~200 ms threshold — and every buffer is a cache hit (zero reads). At these table sizes the planner would ignore an index on a low-cardinality column anyway (11 distinct work types across 93 rows), while every index would cost write throughput on the hottest tables. The structural concern from the audit stands (cost grows with total rows, forever, with no `site_id` predicate), but the 60 s cache from Task 2 already reduces this to roughly one execution per minute per deployment. Re-measure when any entry table passes ~10⁵ rows.

- [ ] **Step 3: Decide.** If total time is under ~200 ms at current volume, **stop here** — the 60 s cache already reduces this to roughly one execution per minute per deployment. Only if a branch is both slow and growing should an index be proposed, and then it goes through the normal `npm run db:generate` + reviewed idempotent SQL + `npm run db:apply` path — **never** `npm run db:migrate`. Adding an index is a schema change and therefore **out of scope for this phase**; open it as its own task with its own review.

---

## Part B — route hygiene (F8)

### Verified state

The auth-narrowing block
```ts
if (!("session" in auth)) {
  return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
}
```
appears in **59** of the repo's **61** `route.ts` files. The site-lookup + archived-check + ownership block is verbatim in the four entry POST routes (`labour`, `machinery`, `materials`, `expenses`).

`requireSiteAccess(request)` returns a union: success has `session`, failure has `{ error, status }`. The repeated three lines are just the narrowing.

---

### Task 6 — `assertSiteWritable`

**Files:**
- Create: `lib/auth/siteWritable.ts`
- Create: `lib/auth/siteWritable.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type SiteWritableResult =
    | { ok: true; site: { supervisorId: string; archivedAt: Date | null }; session: Session }
    | { ok: false; response: Response };

  export async function assertSiteWritable(input: {
    request: NextRequest;
    siteId: string;
    requestId: string;
    forbiddenMessage: string;
  }): Promise<SiteWritableResult>;
  ```
  Tasks 7 and 8 consume it.

**The one asymmetry to parameterise, not erase:** the ownership-failure message is entry-specific — `"You can only log entries for sites you supervise"`. It is asserted by `app/api/entries/{labour,machinery,expenses}/route.test.ts`. Hence `forbiddenMessage` is a **required** parameter with no default: a default would let a future caller ship the wrong copy silently.

- [ ] **Step 1: Write the failing test**

Create `lib/auth/siteWritable.test.ts` (mock `@/lib/db/client` and `@/lib/auth/guards` the way `lib/auth/guards.test.ts` does):

```ts
// Cases:
// 1. authenticated + site exists + not archived + user supervises it
//    → { ok: true, site, session }
// 2. guard failure (requireSiteAccess returns { error, status })
//    → { ok: false }, response status/code exactly the guard's, body message
//      "Authentication required"
// 3. site not found
//    → 404, ERROR_CODES.NOT_FOUND, "Site not found"
// 4. site archived
//    → 404, ERROR_CODES.NOT_FOUND, "Site not found"   (NOT 409 — matches today)
// 5. site supervised by someone else, caller lacks the manage-all capability
//    → 403, ERROR_CODES.FORBIDDEN, body message === the forbiddenMessage passed in
// 6. site supervised by someone else, caller HAS resource:manage_all
//    → { ok: true } (checkOwnership's admin override survives)
// 7. requestId is threaded into every error response
```

Case 4 is important and easy to get wrong: today's routes fold "archived" into the same 404 as "not found" (`if (!site || site.archivedAt)`). Preserving that exact conflation is required — changing archived to a 409 here would break the four route tests.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement**

Create `lib/auth/siteWritable.ts`:

```ts
import type { NextRequest } from "next/server";

import { requireSiteAccess } from "@/lib/auth/guards";
import { checkOwnership } from "@/lib/auth/ownership";
import { db } from "@/lib/db/client";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse } from "@/lib/errors/response";

// The auth + site-lookup + archived + ownership preamble that was copy-pasted
// verbatim into all four entry POST routes. Returns either the session and site
// row, or a ready-to-return error Response — callers never re-derive statuses.
//
// `forbiddenMessage` is required, not defaulted: the entry routes' copy is
// entry-specific ("You can only log entries for sites you supervise") and is
// asserted by their route tests. A default would let a caller ship wrong copy.
export async function assertSiteWritable(input: {
  request: NextRequest;
  siteId: string;
  requestId: string;
  forbiddenMessage: string;
}) {
  const { request, siteId, requestId, forbiddenMessage } = input;

  const auth = await requireSiteAccess(request);
  if (!("session" in auth)) {
    return {
      ok: false as const,
      response: errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId),
    };
  }

  const site = await db.query.sites.findFirst({
    where: (t, { eq }) => eq(t.siteId, siteId),
    columns: { supervisorId: true, archivedAt: true },
  });

  // Archived folds into 404 exactly as the routes have always done — an
  // archived site is deliberately indistinguishable from a missing one here.
  if (!site || site.archivedAt) {
    return {
      ok: false as const,
      response: errorResponse(ERROR_CODES.NOT_FOUND, "Site not found", 404, undefined, requestId),
    };
  }

  if (!checkOwnership(auth.session.user, site.supervisorId)) {
    return {
      ok: false as const,
      response: errorResponse(ERROR_CODES.FORBIDDEN, forbiddenMessage, 403, undefined, requestId),
    };
  }

  return { ok: true as const, site, session: auth.session };
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit**
```bash
git add lib/auth/siteWritable.ts lib/auth/siteWritable.test.ts
git commit -m "feat(auth): add assertSiteWritable helper for entry route preambles"
```

---

### Task 7 — Convert the machinery route (the pilot)

**Files:**
- Modify: `app/api/entries/machinery/route.ts`

Machinery has the simplest body and an existing test. Convert it alone, prove the test is unchanged, then do the rest.

**A real ordering constraint, verified:** the current route runs `requireSiteAccess` and `parseJsonBody` **concurrently** via `Promise.all` (`route.ts:16-19`), then validates the body, then does the site lookup. `assertSiteWritable` needs `siteId`, which only exists *after* validation — so the concurrency shape must change. That is fine and is in fact what the other three routes already do implicitly, but **do not** let the conversion serialise the auth check behind body parsing accidentally in a way that changes error precedence: today an **unauthenticated** request with a **malformed body** returns the auth error, because the auth check is evaluated first. Preserve that.

- [ ] **Step 1: Run the existing test and record the exact output**

```bash
npm run test -- --testTimeout=30000 app/api/entries/machinery/route.test.ts
```
Note every test name and its status. This is your contract.

- [ ] **Step 2: Convert**

```ts
import { assertSiteWritable } from "@/lib/auth/siteWritable";
// requireSiteAccess / checkOwnership imports may become unused — remove only if so.

export const POST = withApi(async ({ request, requestId }) => {
  // Auth is checked first and separately so an unauthenticated request with a
  // malformed body still returns the auth error, as it always has.
  const [auth, parsed] = await Promise.all([
    requireSiteAccess(request),
    parseJsonBody(request, requestId),
  ]);
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }
  if (!parsed.ok) return parsed.response;

  const validation = validateBody(machineryEntrySchema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  const { siteId, date, count, totalCost, remarks } = validation.data;
  // …equipmentType + workStage catalog check unchanged…

  const writable = await assertSiteWritable({
    request,
    siteId,
    requestId,
    forbiddenMessage: "You can only log entries for sites you supervise",
  });
  if (!writable.ok) return writable.response;

  try {
    // …insert unchanged, using writable.session.user.id wherever the old code
    //    used auth.session.user.id…
```

**Cost note:** `assertSiteWritable` calls `requireSiteAccess` again. That is **free** — the guard is header-based with no DB or network round-trip (`lib/auth/guards.ts`, verified). Do not "optimise" by threading the session in; keeping the helper self-contained is what makes it safe to call from a route that forgot its own guard.

- [ ] **Step 3: Run the test — expect byte-identical results to Step 1.**

- [ ] **Step 4: Commit**
```bash
git add app/api/entries/machinery/route.ts
git commit -m "refactor(api): machinery route uses assertSiteWritable"
```

---

### Task 8 — Convert the other three entry routes

**Files:**
- Modify: `app/api/entries/labour/route.ts`
- Modify: `app/api/entries/expenses/route.ts`
- Modify: `app/api/entries/materials/route.ts`

- [ ] **Step 1: labour** — convert exactly as Task 7. Run `app/api/entries/labour/route.test.ts`. Commit.
- [ ] **Step 2: expenses** — same. Run `app/api/entries/expenses/route.test.ts`. Commit.
- [ ] **Step 3: materials** — same. Run `app/api/entries/materials/route.test.ts` (created in Phase 1 Task 6). Commit.
- [ ] **Step 4: Prove the duplication is gone**

```bash
grep -n "You can only log entries for sites you supervise" app/api/entries/*/route.ts
```
Expected: four matches, each now a single `forbiddenMessage:` argument rather than a full `errorResponse(...)` block.

```bash
grep -c "db.query.sites.findFirst" app/api/entries/labour/route.ts app/api/entries/machinery/route.ts app/api/entries/materials/route.ts app/api/entries/expenses/route.ts
```
Expected: 0 in all four.

- [ ] **Step 5: Full verification**
```bash
npm run lint && npm run test -- --testTimeout=30000
```

---

### Task 9 — `withAuthedApi`

**Files:**
- Modify: `lib/http/withApi.ts`
- Create: `lib/http/withAuthedApi.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function withAuthedApi(
    capability: Capability,
    handler: (args: { request: NextRequest; requestId: string; session: Session }) => Promise<Response>,
  ): (request: NextRequest) => Promise<Response>;

  export function withAuthedApiRoute<TCtx>(
    capability: Capability,
    handler: (args: { request: NextRequest; requestId: string; session: Session }, ctx: TCtx) => Promise<Response>,
  ): (request: NextRequest, ctx: TCtx) => Promise<Response>;
  ```

**Scope discipline — read this before starting.** There are 59 call sites. **Do not convert 59 routes in this phase.** Ship the wrapper plus **three** conversions as proof, and let the remaining routes migrate opportunistically whenever someone is already editing them. A 59-file mechanical diff is unreviewable, and an unreviewable diff across every authenticated endpoint in the app is exactly where an authorization regression hides.

**The error message is not uniform.** Verified: entry routes say `"Authentication required"`, `app/api/admin/catalog/route.ts:12` says `"Admin access required"`. So the wrapper must accept a message override, or converting a route silently changes its user-facing copy.

- [ ] **Step 1: Write the failing test**

Create `lib/http/withAuthedApi.test.ts`:

```ts
// Cases:
// 1. guard succeeds → handler is invoked with { request, requestId, session }
//    and its Response is returned untouched.
// 2. guard fails → handler is NEVER invoked; the response carries the guard's
//    exact error code and status, and the default message
//    "Authentication required".
// 3. an unauthorizedMessage override is used verbatim when supplied.
// 4. the wrapper still runs inside withApi: the response carries the
//    x-request-id header and rate limiting is applied (assert applyRateLimit
//    was called).
// 5. a handler that throws still produces the standard 500 envelope that
//    withApi produces today — the wrapper must not swallow or reshape errors.
```

Case 4 is the load-bearing one: if `withAuthedApi` accidentally bypasses `withApi`, every converted route silently loses rate limiting and request-id logging. That is a security regression disguised as a refactor.

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement — as a wrapper AROUND `withApi`, never a replacement**

Append to `lib/http/withApi.ts`:

```ts
// Folds the 3-line auth-narrowing guard repeated in 59 route files into the
// wrapper, so handlers receive a guaranteed session. Composed ON TOP of
// withApi — rate limiting, request ids and logging are unchanged and still
// apply to rejected requests.
export function withAuthedApi(
  capability: Capability,
  handler: (args: { request: NextRequest; requestId: string; session: Session }) => Promise<Response>,
  options?: { unauthorizedMessage?: string },
) {
  return withApi(async ({ request, requestId }) => {
    const auth = await requireCapability(request, capability);
    if (!("session" in auth)) {
      return errorResponse(
        auth.error,
        options?.unauthorizedMessage ?? "Authentication required",
        auth.status,
        undefined,
        requestId,
      );
    }
    return handler({ request, requestId, session: auth.session });
  });
}

export function withAuthedApiRoute<TCtx>(
  capability: Capability,
  handler: (
    args: { request: NextRequest; requestId: string; session: Session },
    ctx: TCtx,
  ) => Promise<Response>,
  options?: { unauthorizedMessage?: string },
) {
  return withApiRoute<TCtx>(async ({ request, requestId }, ctx) => {
    const auth = await requireCapability(request, capability);
    if (!("session" in auth)) {
      return errorResponse(
        auth.error,
        options?.unauthorizedMessage ?? "Authentication required",
        auth.status,
        undefined,
        requestId,
      );
    }
    return handler({ request, requestId, session: auth.session }, ctx);
  });
}
```

**Only `requireCapability` is wrapped.** Routes using `requireSiteAccess`, `requireAuth` or `requireAdmin` are deliberately **not** covered — capability-based checks are the app's stated direction (`lib/auth/ownership.ts` uses `resource:manage_all` rather than role literals), and quietly re-pointing a route from `requireSiteAccess` to `requireCapability` changes who can call it. Any such route must be converted deliberately, one at a time, with its own test.

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Convert exactly three routes as proof**

Pick three that already use `requireCapability` **and** have tests. Verify candidates with:
```bash
grep -ln "requireCapability" app/api/**/route.ts | while read f; do [ -f "${f%.ts}.test.ts" ] && echo "$f"; done
```
Convert them one at a time; after each, run that route's test and confirm identical results, then commit separately.

- [ ] **Step 6: Document the remaining migration**

Add to this doc, under the follow-ups section, the count of unconverted routes:
```bash
grep -rln 'if (!("session" in auth))' app/api | wc -l
```
Record the number (expect 56 after three conversions). Future PRs shrink it.

- [ ] **Step 7: Full verification + commit**
```bash
npm run lint && npm run test -- --testTimeout=30000
git add lib/http/withApi.ts lib/http/withAuthedApi.test.ts
git commit -m "feat(http): add withAuthedApi wrapper composed over withApi"
```

---

## Phase regression checklist

### Automated

- [ ] `npm run lint` → exit 0.
- [ ] `npm run test -- --testTimeout=30000` → green, pass count = baseline + new tests.
- [ ] `npm run test:e2e` → green. `smoke.spec.ts` exercises authenticated routes; a broken `withAuthedApi` shows up here.
- [ ] Guard coverage did not shrink:
  ```bash
  find app/api -name route.ts | wc -l          # expect 61
  grep -rln 'in auth\|withAuthedApi' app/api | wc -l   # expect 59
  ```
  If the second number drops, a route lost its auth check. **Stop and fix before merging.**
- [ ] `grep -rn "db.query.sites.findFirst" app/api/entries/` → empty.
- [ ] `grep -rn "getOrSetJson" app/api/admin/catalog/route.ts` → present.

### Security

- [ ] **No route lost rate limiting.** `withAuthedApi` is implemented as a call to `withApi`, not a reimplementation — verify by reading the diff, and by test case 4 in Task 9.
- [ ] **No route lost its auth guard.** The counts above, plus: for each of the three routes converted in Task 9, confirm the unauthorized status and code in its test are unchanged from before.
- [ ] **Cache never serves across users.** `catalogOverviewCacheKey()` is global by design, and the route's auth guard runs **before** `getOrSetJson`, so an unauthorized caller can neither read nor warm it (Task 2 test case 4). Confirm the guard is above the cache call in the final file.
- [ ] **No user input reaches the cache key.** The key is a constant. `grep -n "catalogOverviewCacheKey" lib/cache/keys.ts` → no parameters.
- [ ] **`sql.raw` surface unchanged.** `git diff main -- lib/catalog/overviewQuery.ts` → empty. This phase caches the query; it does not rewrite it.
- [ ] **Ownership semantics unchanged.** `assertSiteWritable` uses the same `checkOwnership` call, so the `resource:manage_all` admin override still applies (Task 6 test case 6).

### Performance

- [ ] Second load of the admin catalog screen logs `cache_hit` and issues no DB query (check the structured logs).
- [ ] Toggle/rename/reorder issue **zero** `GET /api/admin/catalog` requests (Network tab).
- [ ] Reorder issues two **parallel**, not sequential, PATCHes (Network tab waterfall).
- [ ] No new DB round-trip was added to any entry POST route: `assertSiteWritable` performs the same single `sites.findFirst` the inline code did, and `requireSiteAccess` is header-only. Confirm with `grep -c "await db" app/api/entries/labour/route.ts` before/after.
- [ ] Redis-absent path still works: unset `UPSTASH_REDIS_REST_URL`, load the catalog screen → renders correctly, logs no error.

### Data-correctness

- [ ] **Usage counts are not zeroed on a cache hit.** Load the catalog screen twice and compare a non-zero usage number across both loads. If the second load shows 0, the `Map` serialisation trap in Task 2 was hit — re-read that note.
- [ ] After a rename, the new name appears immediately (optimistic) **and** survives a hard refresh (invalidation worked).
- [ ] After a merge, usage counts on the target row are correct after the automatic refetch.
- [ ] The delete-guard still blocks deleting an in-use option (it uses live counts, not the cache) — try deleting a subcategory that has entries → 409 "This item is still in use".

---

## Follow-ups this phase deliberately defers

- **Transactional batch reorder endpoint.** Two parallel PATCHes are not atomic. Pre-existing, now faster, still not atomic. Needs its own API design.
- **Indexes on the grouped usage columns.** Schema change; measure first (Task 5), propose separately.
- **The other 56 routes still carrying the inline auth guard.** Migrate opportunistically. Measured after the three proof conversions on 2026-08-06: `grep -rln 'if (!("session" in auth))' app/api | wc -l` → **56**. Guard coverage is 60 of 61 route files; the only unguarded file is the always-410 `auth/create-profile` stub.
- **Routes using `requireSiteAccess`/`requireAuth`/`requireAdmin`** are out of `withAuthedApi`'s scope by design.
