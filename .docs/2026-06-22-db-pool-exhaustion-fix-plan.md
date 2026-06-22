# DB Pool Exhaustion Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the admin-catalog "Loading…" freeze permanently by reaping orphaned DB queries, cutting per-request query fan-out, cancelling queries on request abort, and converting row-pulling aggregations to SQL aggregates.

**Architecture:** Server-side `statement_timeout` on role `postgres` reaps orphans (the universal backstop, the only knob that survives the Supavisor pooler). The catalog endpoint's 9-query fan-out collapses to a single combined query. The heavy read endpoints wire `request.signal` → postgres.js `PendingQuery.cancel()` so aborts free their backend immediately. Three row-pulling aggregations become SQL `SUM`/`COUNT`.

**Tech Stack:** Next 16 (App Router), drizzle-orm 0.45 + postgres.js 3.4 against Supabase transaction pooler (:6543), Vitest 3.

**Spec:** `.docs/2026-06-22-db-pool-exhaustion-fix-spec.md`

---

## Implementation note on Fix 3 (read before Task 6)

`drizzle-orm/postgres-js` does **not** surface the underlying postgres.js `PendingQuery`, so its `.cancel()` cannot be reached through a `db.select()` call. Global cancellation via `withApi` is therefore not cleanly possible. The implementable cure: expose the raw postgres.js `client`, and for the heavy read endpoints run the combined query through a small `runCancellable` helper that wires `signal` → `query.cancel()`. Every other route relies on Fix 1's 30s timeout as the backstop. This is a deliberate, documented narrowing of the spec's "thread through withApi" wording.

## Test strategy

Part B / Fix 2 correctness is proven by **integration tests against a real database**, isolated with a rolled-back transaction so nothing persists. A shared helper (Task 1) skips these tests when `DATABASE_URL` is absent (e.g. CI without DB), so they never break the unit suite. The freeze itself is proven by a **load repro script** (Task 8), red before Fix 1/3 and green after.

## File structure

- Create `scripts/apply-statement-timeout.mts` — one-shot Fix 1 applier/verifier.
- Create `scripts/repro-pool-wedge.mts` — load repro proving the freeze + the fix.
- Create `lib/db/testing.ts` — integration-test helper (transactional, auto-skip).
- Create `lib/db/abort.ts` — `runCancellable` (Fix 3) + raw `client` re-export.
- Create `lib/catalog/overviewQuery.ts` — the single combined catalog query (Fix 2).
- Modify `lib/db/client.ts` — export raw `client`; drop dead `statement_timeout`.
- Modify `app/api/admin/catalog/route.ts` — use combined query + `runCancellable`.
- Modify `lib/db/queries/sites.ts` — `getSiteTrackedSpend` → SQL SUM.
- Modify `lib/db/queries/entries.ts` — `getSiteOperationSummary` → SQL COUNT/SUM.
- Modify `lib/services/dashboard.ts` — fold active+archived sites into one scan.
- New test files alongside each modified module.

---

## Task 1: Integration-test harness

**Files:**
- Create: `lib/db/testing.ts`
- Test: (used by later tasks)

- [ ] **Step 1: Write the helper**

```typescript
// lib/db/testing.ts
// Integration-test helper. Runs the callback inside a transaction that is ALWAYS
// rolled back, so seeded rows never persist. Tests using this auto-skip when no
// DATABASE_URL is configured (keeps the unit suite green in DB-less CI).
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/lib/db/schema";

export const hasDb = Boolean(process.env.DATABASE_URL);

// Describe-or-skip: use in place of `describe` for DB integration suites.
export const describeDb = hasDb ? describe : describe.skip;

type Tx = ReturnType<typeof drizzle<typeof schema>>;

// Runs `fn` with a drizzle handle bound to a transaction, then throws a sentinel
// to force rollback. Each test gets a clean slate without truncating shared tables.
export async function withRollback<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
  const ROLLBACK = Symbol("rollback");
  let captured: T;
  try {
    await client.begin(async (sql) => {
      const tx = drizzle(sql, { schema });
      captured = await fn(tx);
      throw ROLLBACK; // abort the tx; nothing persists
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  } finally {
    await client.end({ timeout: 5 });
  }
  return captured!;
}
```

Note: `describe` is a global in Vitest when `globals: true`. Verify `vitest.config.ts` sets `test.globals: true`; if not, import `{ describe }` from `"vitest"` at the top of this file.

- [ ] **Step 2: Verify Vitest globals config**

Run: `grep -n "globals" vitest.config.ts vitest.config.mts 2>/dev/null`
Expected: `globals: true`. If absent, add `import { describe } from "vitest";` to `testing.ts` and skip relying on the global.

- [ ] **Step 3: Commit**

```bash
git add lib/db/testing.ts
git commit -m "test: add transactional DB integration helper"
```

---

## Task 2: Pool config cleanup — drop the dead statement_timeout, export raw client

**Files:**
- Modify: `lib/db/client.ts`

- [ ] **Step 1: Edit `lib/db/client.ts`**

Replace the `createDb` function and exports so the raw postgres.js client is reusable (needed by Fix 3 and the test helper), and remove the proven-ineffective `connection.statement_timeout`.

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/lib/db/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local");
}

function createClient() {
  return postgres(process.env.DATABASE_URL!, {
    max: 15, // headroom for endpoints that fan out; well under the pooler limit
    idle_timeout: 120, // hold idle connections 2m to skip cold TLS+pooler handshake
    connect_timeout: 10,
    ssl: process.env.NODE_ENV === "production" ? "require" : false,
    prepare: false, // mandatory for Supabase Transaction pooler
    connection: {
      application_name: "siteops-next",
      // NOTE: client-side statement_timeout is STRIPPED by the Supavisor pooler,
      // so it is set server-side on the `postgres` role instead — see
      // scripts/apply-statement-timeout.mts. That role-level timeout is what
      // reaps orphaned queries from aborted requests and keeps the pool healthy.
    },
  });
}

// Reuse across HMR reloads / warm invocations to avoid connection storms.
const globalForDb = globalThis as unknown as {
  __siteopsClient?: ReturnType<typeof createClient>;
  __siteopsDb?: ReturnType<typeof drizzle<typeof schema>>;
};

export const client = globalForDb.__siteopsClient ?? createClient();
export const db = globalForDb.__siteopsDb ?? drizzle(client, { schema });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__siteopsClient = client;
  globalForDb.__siteopsDb = db;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: PASS (no references to a removed export; `db` still exported, `client` newly exported).

- [ ] **Step 3: Commit**

```bash
git add lib/db/client.ts
git commit -m "fix(db): drop pooler-stripped statement_timeout, export raw client"
```

---

## Task 3: Fix 1 — apply & verify role-level statement_timeout

**Files:**
- Create: `scripts/apply-statement-timeout.mts`

- [ ] **Step 1: Write the applier/verifier script**

```typescript
// scripts/apply-statement-timeout.mts
// Fix 1: set a server-side statement_timeout on the `postgres` role. This is the
// ONLY timeout that survives the Supavisor transaction pooler, so it is what reaps
// orphaned queries left by aborted HTTP requests and lets the pool self-heal.
// Run: node --import tsx scripts/apply-statement-timeout.mts [seconds]
// Revert: node --import tsx scripts/apply-statement-timeout.mts reset
import "dotenv/config";
import postgres from "postgres";

const arg = process.argv[2] ?? "30";
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set (check .env.local)");

const sql = postgres(url, { max: 1, prepare: false, ssl: "require" });

try {
  const before = await sql`SHOW statement_timeout`;
  console.log("before:", before[0].statement_timeout);

  if (arg === "reset") {
    await sql.unsafe(`ALTER ROLE postgres RESET statement_timeout`);
    console.log("RESET applied");
  } else {
    const seconds = Number(arg);
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`bad seconds: ${arg}`);
    await sql.unsafe(`ALTER ROLE postgres SET statement_timeout = '${seconds}s'`);
    console.log(`ALTER ROLE postgres SET statement_timeout = '${seconds}s' applied`);
  }

  // ALTER ROLE only takes effect on NEW sessions. Open a fresh connection to confirm.
  const fresh = postgres(url, { max: 1, prepare: false, ssl: "require" });
  const after = await fresh`SHOW statement_timeout`;
  console.log("after (fresh session):", after[0].statement_timeout);
  await fresh.end({ timeout: 5 });
} finally {
  await sql.end({ timeout: 5 });
}
```

Note on `ssl`: the script connects through the pooler the same way the app does in production. If the dev machine rejects `ssl: "require"`, set it to match `client.ts` for the current `NODE_ENV` (e.g. `false` locally).

- [ ] **Step 2: RISK GATE — measure the Analytics query first**

Before applying, confirm the one legitimately-long query stays under 30s. Inspect `app/api/admin/analytics/route.ts:46` and run that SQL directly (psql or a throwaway script) against representative data; time it.

- If it can exceed 30s → apply with `60` instead of `30`, OR add `SET LOCAL statement_timeout = 0` inside that route's query. Record the decision in the spec.
- Expected for this CRUD-scale app: well under 30s. Proceed with `30`.

- [ ] **Step 3: Apply**

Run: `node --import tsx scripts/apply-statement-timeout.mts 30`
Expected output: `before: 2min` … `after (fresh session): 30s`.

If `after` still shows `2min`, the ALTER did not take on a fresh session — STOP and investigate (wrong role / pooler caching). Do not proceed; the death-spiral backstop is not in place.

- [ ] **Step 4: Commit**

```bash
git add scripts/apply-statement-timeout.mts
git commit -m "fix(db): role-level statement_timeout applier (Fix 1)"
```

---

## Task 4: Fix 2 — combined catalog overview query (write the query + test)

**Files:**
- Create: `lib/catalog/overviewQuery.ts`
- Test: `lib/catalog/overviewQuery.test.ts`

The 7 usage sources count a free-text column per table, grouped by value, keyed by category
name. Combine them into a single `UNION ALL`. `USAGE_SOURCES` already enumerates
`(categoryName, table, column)`; build one query from it via the raw `client` so it is a
single round-trip and (Task 6) cancellable.

- [ ] **Step 1: Write the failing integration test**

```typescript
// lib/catalog/overviewQuery.test.ts
import { sql } from "drizzle-orm";
import { expect, it } from "vitest";

import { describeDb, withRollback } from "@/lib/db/testing";
import { fetchUsageCounts } from "@/lib/catalog/overviewQuery";
import {
  categories,
  labourEntries,
  sites,
  users,
} from "@/lib/db/schema";

describeDb("fetchUsageCounts", () => {
  it("counts labour work_type usages grouped by value", async () => {
    await withRollback(async (tx) => {
      // minimal fixtures: a user (supervisor), a site, two labour entries same work type
      const [u] = await tx.insert(users).values({
        email: `t-${Date.now()}@x.com`, role: "Supervisor", name: "T",
      }).returning();
      const [s] = await tx.insert(sites).values({
        name: `S-${Date.now()}`, location: "L", supervisorId: u.id, status: "In Progress",
      }).returning();
      await tx.insert(labourEntries).values([
        { siteId: s.siteId, date: "2026-06-22", workType: "Masonry", peopleCount: 1 },
        { siteId: s.siteId, date: "2026-06-22", workType: "Masonry", peopleCount: 2 },
        { siteId: s.siteId, date: "2026-06-22", workType: "Painting", peopleCount: 1 },
      ]);

      const counts = await fetchUsageCounts(tx);
      const labour = counts.get("Labour")!;
      expect(labour.get("Masonry")).toBe(2);
      expect(labour.get("Painting")).toBe(1);
    });
  });
});
```

Note: adjust the `users`/`sites` insert column names to match the actual schema if these differ — read `lib/db/schema.ts` for the exact NOT NULL columns before running. The assertion on counts is the contract.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- overviewQuery`
Expected: FAIL — `fetchUsageCounts` is not exported.

- [ ] **Step 3: Implement the combined query**

```typescript
// lib/catalog/overviewQuery.ts
// Single-round-trip usage counts for the admin catalog overview. Replaces the
// per-source fan-out (7 group-by queries) with one UNION ALL so a catalog load
// consumes one pool slot instead of ~9.
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "@/lib/db/schema";
import { USAGE_SOURCES } from "@/lib/catalog/usageSources";

type Db = PostgresJsDatabase<typeof schema>;

// Map of categoryName -> (value -> count). Mirrors the old usageByName shape.
export async function fetchUsageCounts(
  db: Db,
): Promise<Map<string, Map<string, number>>> {
  // Build one UNION ALL across all sources. Each branch tags rows with the source's
  // categoryName so a single result set carries every count. drizzle's `sql` builder
  // safely interpolates the identifiers from the schema column metadata.
  const parts = USAGE_SOURCES.map(
    ({ categoryName, column }) => sql`
      select ${categoryName}::text as category_name,
             ${column}::text as value,
             count(*)::int as n
      from ${column.table}
      where ${column} is not null
      group by ${column}
    `,
  );
  const unioned = sql.join(parts, sql` union all `);
  const rows = await db.execute<{ category_name: string; value: string; n: number }>(
    sql`${unioned}`,
  );

  const out = new Map<string, Map<string, number>>();
  for (const r of rows) {
    let byValue = out.get(r.category_name);
    if (!byValue) {
      byValue = new Map();
      out.set(r.category_name, byValue);
    }
    byValue.set(String(r.value), Number(r.n));
  }
  // Ensure every source appears even with zero rows (stable shape for callers).
  for (const { categoryName } of USAGE_SOURCES) {
    if (!out.has(categoryName)) out.set(categoryName, new Map());
  }
  return out;
}
```

Note: `column.table` access — drizzle `PgColumn` exposes its table via `getTableName`/the column's `.table` symbol. If `${column.table}` does not resolve, import the tables and pair them in `USAGE_SOURCES` (it already carries `table`); use `${source.table}` instead. Prefer reading `USAGE_SOURCES`’ existing `table` field: change the map to destructure `{ categoryName, table, column }` and interpolate `${table}`.

- [ ] **Step 4: Correct the FROM to use the source's table**

Use the `table` already on each `UsageSource` rather than deriving it from the column:

```typescript
  const parts = USAGE_SOURCES.map(
    ({ categoryName, table, column }) => sql`
      select ${categoryName}::text as category_name,
             ${column}::text as value,
             count(*)::int as n
      from ${table}
      where ${column} is not null
      group by ${column}
    `,
  );
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- overviewQuery`
Expected: PASS (skips with "no DATABASE_URL" if DB absent — that is acceptable locally only if you then run it where DB is reachable).

- [ ] **Step 6: Commit**

```bash
git add lib/catalog/overviewQuery.ts lib/catalog/overviewQuery.test.ts
git commit -m "perf(catalog): single UNION ALL usage-count query (Fix 2)"
```

---

## Task 5: Fix 2 — wire the catalog route to the combined query

**Files:**
- Modify: `app/api/admin/catalog/route.ts`

- [ ] **Step 1: Replace the fan-out in the route**

Keep categories + subcategories (two light selects) but replace the 7-query
`Promise.all` with the single `fetchUsageCounts` call.

```typescript
import { requireCapability } from "@/lib/auth/guards";
import { buildCatalogOverview } from "@/lib/catalog/overview";
import { fetchUsageCounts } from "@/lib/catalog/overviewQuery";
import { db } from "@/lib/db/client";
import { categories, subcategories } from "@/lib/db/schema";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { withApi } from "@/lib/http/withApi";

export const GET = withApi(async ({ request, requestId }) => {
  const auth = await requireCapability(request, "site:read_all");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
  }

  const [categoryRows, subcategoryRows, usageByName] = await Promise.all([
    db.select({ categoryId: categories.categoryId, name: categories.name }).from(categories),
    db
      .select({
        subcategoryId: subcategories.subcategoryId,
        categoryId: subcategories.categoryId,
        name: subcategories.name,
        isActive: subcategories.isActive,
        sortOrder: subcategories.sortOrder,
      })
      .from(subcategories),
    fetchUsageCounts(db),
  ]);

  const categoryNameById = new Map(categoryRows.map((c) => [c.categoryId, c.name]));
  const usageBySubcategoryId: Record<string, number> = {};
  for (const sub of subcategoryRows) {
    const catName = categoryNameById.get(sub.categoryId);
    if (!catName) continue;
    usageBySubcategoryId[sub.subcategoryId] = usageByName.get(catName)?.get(sub.name) ?? 0;
  }

  const overview = buildCatalogOverview({
    categories: categoryRows,
    subcategories: subcategoryRows,
    usageBySubcategoryId,
  });

  return successResponse({ operations: overview }, 200, requestId);
});
```

This drops peak fan-out from ~9 to 3 parallel queries; Task 6 makes the heavy one cancellable.

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Manual smoke (if dev DB reachable)**

Run dev server, load `/app/admin/catalog`. Expected: catalog renders; response sub-second.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/catalog/route.ts
git commit -m "perf(catalog): use combined usage-count query in route (Fix 2)"
```

---

## Task 6: Fix 3 — cancel-on-abort helper + apply to catalog

**Files:**
- Create: `lib/db/abort.ts`
- Test: `lib/db/abort.test.ts`
- Modify: `app/api/admin/catalog/route.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// lib/db/abort.test.ts
import { expect, it } from "vitest";

import { describeDb } from "@/lib/db/testing";
import { client } from "@/lib/db/client";
import { runCancellable } from "@/lib/db/abort";

describeDb("runCancellable", () => {
  it("resolves normally when not aborted", async () => {
    const rows = await runCancellable(new AbortController().signal, (sql) =>
      sql`select 1 as n`,
    );
    expect(rows[0].n).toBe(1);
  });

  it("cancels an in-flight query when the signal aborts", async () => {
    const ac = new AbortController();
    const p = runCancellable(ac.signal, (sql) => sql`select pg_sleep(10)`);
    setTimeout(() => ac.abort(), 100);
    await expect(p).rejects.toThrow(); // cancelled query rejects rather than hanging 10s
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- abort`
Expected: FAIL — `runCancellable` not exported.

- [ ] **Step 3: Implement the helper**

```typescript
// lib/db/abort.ts
// Fix 3: tie an HTTP request's AbortSignal to a postgres.js query so an aborted
// request actively CANCELS its in-flight query instead of orphaning the backend
// (which would pin a pool slot until the role statement_timeout reaped it).
// drizzle does not expose the cancellable PendingQuery handle, so callers build
// the query through the raw postgres.js `client` passed to `build`.
import type { PendingQuery, Row } from "postgres";

import { client } from "@/lib/db/client";

export async function runCancellable<T extends readonly Row[]>(
  signal: AbortSignal,
  build: (sql: typeof client) => PendingQuery<T>,
): Promise<T> {
  const query = build(client);
  const onAbort = () => query.cancel();
  if (signal.aborted) {
    query.cancel();
  } else {
    signal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    return await query;
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- abort`
Expected: PASS — the abort case rejects in ~100ms, not 10s.

- [ ] **Step 5: Route the combined usage-count query through `runCancellable`**

`fetchUsageCounts` currently takes a drizzle `db`. Add an overload path so the catalog
route can run it cancellably. Simplest: give `overviewQuery.ts` a raw-client variant and
have the route pass `request.signal`. Update `lib/catalog/overviewQuery.ts`:

```typescript
import postgres from "postgres";
import { runCancellable } from "@/lib/db/abort";
import type { client as RawClient } from "@/lib/db/client";

// ...existing fetchUsageCounts(db) stays for non-HTTP callers/tests...

// Cancellable variant for request-scoped callers. Builds the same UNION ALL via the
// raw postgres.js client so an aborted request cancels it server-side.
export async function fetchUsageCountsCancellable(
  signal: AbortSignal,
): Promise<Map<string, Map<string, number>>> {
  const rows = await runCancellable(signal, (sql) => {
    const parts = USAGE_SOURCES.map(
      ({ categoryName, table, column }) =>
        sql`select ${categoryName}::text as category_name, ${sql(columnName(column))} as value, count(*)::int as n from ${sql(tableName(table))} where ${sql(columnName(column))} is not null group by ${sql(columnName(column))}`,
    );
    return parts.reduce((acc, p) => sql`${acc} union all ${p}`) as any;
  });
  return toCountMap(rows);
}
```

Note: building raw postgres.js SQL needs the physical table/column NAMES, not drizzle
objects. Add small helpers using drizzle metadata:

```typescript
import { getTableName } from "drizzle-orm";
import { PgColumn } from "drizzle-orm/pg-core";
function tableName(t: any): string { return getTableName(t); }
function columnName(c: PgColumn): string { return c.name; }
```

And extract the map-building from `fetchUsageCounts` into a shared `toCountMap(rows)` so both
variants reuse it. If the raw-SQL identifier interpolation proves fiddly, an acceptable
fallback is to keep `fetchUsageCounts(db)` (drizzle) for correctness and ONLY rely on Fix 1
to reap the catalog query — note that decision here and skip the cancellable variant. Fix 1
already prevents the death spiral; Fix 3 on catalog is the optimization, not the load-bearing
guard.

- [ ] **Step 6: Use the cancellable variant in the route (only if Step 5 landed)**

In `app/api/admin/catalog/route.ts`, replace `fetchUsageCounts(db)` in the `Promise.all`
with `fetchUsageCountsCancellable(request.signal)`.

- [ ] **Step 7: Typecheck + test**

Run: `npm run lint && npm test -- abort overviewQuery`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/db/abort.ts lib/db/abort.test.ts lib/catalog/overviewQuery.ts app/api/admin/catalog/route.ts
git commit -m "fix(db): cancel catalog query on request abort (Fix 3)"
```

---

## Task 7: Part B — SQL aggregates for the three row-pulling queries

### 7a: `getSiteTrackedSpend` → SQL SUM

**Files:**
- Modify: `lib/db/queries/sites.ts`
- Test: `lib/db/queries/sites.spend.test.ts`

- [ ] **Step 1: Write the failing integration test**

```typescript
// lib/db/queries/sites.spend.test.ts
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";

import { describeDb, withRollback } from "@/lib/db/testing";
import { getSiteTrackedSpendTx } from "@/lib/db/queries/sites";
import { calculateSiteTrackedSpend } from "@/lib/db/queries/operationTotals";
import {
  expenseEntries, labourEntries, machineryEntries, materialEntries, sites, users,
} from "@/lib/db/schema";

describeDb("getSiteTrackedSpendTx", () => {
  it("matches the row-based calculateSiteTrackedSpend total", async () => {
    await withRollback(async (tx) => {
      const [u] = await tx.insert(users).values({
        email: `t-${Date.now()}@x.com`, role: "Supervisor", name: "T",
      }).returning();
      const [s] = await tx.insert(sites).values({
        name: `S-${Date.now()}`, location: "L", supervisorId: u.id, status: "In Progress",
      }).returning();
      const sid = s.siteId;
      await tx.insert(labourEntries).values([
        { siteId: sid, date: "2026-06-22", workType: "A", peopleCount: 2, wagePerHead: "500.00" },
        { siteId: sid, date: "2026-06-22", workType: "A", peopleCount: 1, salaryAmount: "1200.00" },
      ]);
      await tx.insert(materialEntries).values([{ siteId: sid, date: "2026-06-22", materialType: "M", cost: "300.50" }]);
      await tx.insert(machineryEntries).values([{ siteId: sid, date: "2026-06-22", equipmentType: "E", totalCost: "750.00" }]);
      await tx.insert(expenseEntries).values([{ siteId: sid, date: "2026-06-22", category: "Misc", amount: "40.00" }]);

      const [labour, material, machinery, expense] = await Promise.all([
        tx.select().from(labourEntries).where(eq(labourEntries.siteId, sid)),
        tx.select().from(materialEntries).where(eq(materialEntries.siteId, sid)),
        tx.select().from(machineryEntries).where(eq(machineryEntries.siteId, sid)),
        tx.select().from(expenseEntries).where(eq(expenseEntries.siteId, sid)),
      ]);
      const expected = calculateSiteTrackedSpend({ labour, material, machinery, expense });

      const actual = await getSiteTrackedSpendTx(tx, sid);
      expect(Number(actual)).toBeCloseTo(expected, 2);
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- sites.spend`
Expected: FAIL — `getSiteTrackedSpendTx` not exported.

- [ ] **Step 3: Implement SQL-aggregate version**

The labour total has fallback logic (split salary → stored salary → people×wage). Express it
in SQL with `COALESCE`/`CASE` so the SUM matches `calculateLabourTotal`:

```typescript
// add to lib/db/queries/sites.ts
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";

type Db = PostgresJsDatabase<typeof schema>;

// Per-site tracked spend computed entirely in SQL (no row transfer). The labour
// branch mirrors calculateLabourTotal: prefer mason+helper split, else stored
// salary, else people_count * wage_per_head. NULL numerics coalesce to 0.
export async function getSiteTrackedSpendTx(db: Db, siteId: string): Promise<string> {
  const rows = await db.execute<{ total: string }>(sql`
    select
      coalesce((
        select sum(
          case
            when coalesce(mason_salary_amount,0) + coalesce(helper_salary_amount,0) > 0
              then coalesce(mason_salary_amount,0) + coalesce(helper_salary_amount,0)
            when coalesce(salary_amount,0) > 0 then salary_amount
            else coalesce(people_count,0) * coalesce(wage_per_head,0)
          end
        ) from labour_entries where site_id = ${siteId}::uuid
      ), 0)
      + coalesce((select sum(coalesce(cost,0)) from material_entries where site_id = ${siteId}::uuid), 0)
      + coalesce((select sum(coalesce(total_cost,0)) from machinery_entries where site_id = ${siteId}::uuid), 0)
      + coalesce((select sum(coalesce(amount,0)) from expense_entries where site_id = ${siteId}::uuid), 0)
      as total
  `);
  return String(Number(rows[0]?.total ?? 0));
}

export async function getSiteTrackedSpend(siteId: string): Promise<string> {
  return getSiteTrackedSpendTx(db, siteId);
}
```

Remove the old `Promise.all` body of `getSiteTrackedSpend` (now delegated). Keep the
`getSiteTotalExpenses = getSiteTrackedSpend` alias. Drop now-unused imports
(`labourEntries`, etc.) if no longer referenced — let `npm run lint` flag them.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- sites.spend`
Expected: PASS — `actual` within 0.01 of `expected`.

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries/sites.ts lib/db/queries/sites.spend.test.ts
git commit -m "perf(db): getSiteTrackedSpend computes total in SQL"
```

### 7b: `getSiteOperationSummary` → SQL COUNT/SUM

**Files:**
- Modify: `lib/db/queries/entries.ts:500-552`
- Test: `lib/db/queries/operationSummary.test.ts`

- [ ] **Step 1: Write the failing integration test**

```typescript
// lib/db/queries/operationSummary.test.ts
import { expect, it } from "vitest";

import { describeDb, withRollback } from "@/lib/db/testing";
import { getSiteOperationSummaryTx } from "@/lib/db/queries/entries";
import { labourEntries, sites, users } from "@/lib/db/schema";

describeDb("getSiteOperationSummaryTx", () => {
  it("returns SQL counts and spend matching the inserted rows", async () => {
    await withRollback(async (tx) => {
      const [u] = await tx.insert(users).values({
        email: `t-${Date.now()}@x.com`, role: "Supervisor", name: "T",
      }).returning();
      const [s] = await tx.insert(sites).values({
        name: `S-${Date.now()}`, location: "L", supervisorId: u.id, status: "In Progress",
      }).returning();
      await tx.insert(labourEntries).values([
        { siteId: s.siteId, date: "2026-06-22", workType: "A", peopleCount: 2, wagePerHead: "500.00" },
        { siteId: s.siteId, date: "2026-06-22", workType: "A", peopleCount: 1, salaryAmount: "1200.00" },
      ]);

      const summary = await getSiteOperationSummaryTx(tx, s.siteId, "2026-06-22");
      expect(summary.labour.todayCount).toBe(2);
      expect(summary.labour.todaySpend).toBeCloseTo(2 * 500 + 1200, 2);
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- operationSummary`
Expected: FAIL — `getSiteOperationSummaryTx` not exported.

- [ ] **Step 3: Implement SQL count+sum version**

Replace the 5-query row-pulling body. Counts and spends computed in SQL; the same labour
CASE as 7a; incident has no spend (null) and filters on `created_at::date`.

```typescript
// in lib/db/queries/entries.ts — add Tx-taking impl, keep public signature delegating
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";

type Db = PostgresJsDatabase<typeof schema>;

export async function getSiteOperationSummaryTx(
  db: Db, siteId: string, date: string,
): Promise<SiteOperationSummary> {
  const rows = await db.execute<{
    labour_count: number; labour_spend: string;
    material_count: number; material_spend: string;
    machinery_count: number; machinery_spend: string;
    expense_count: number; expense_spend: string;
    incident_count: number;
  }>(sql`
    select
      (select count(*) from labour_entries where site_id=${siteId}::uuid and date=${date}) as labour_count,
      coalesce((select sum(
        case
          when coalesce(mason_salary_amount,0)+coalesce(helper_salary_amount,0)>0
            then coalesce(mason_salary_amount,0)+coalesce(helper_salary_amount,0)
          when coalesce(salary_amount,0)>0 then salary_amount
          else coalesce(people_count,0)*coalesce(wage_per_head,0)
        end) from labour_entries where site_id=${siteId}::uuid and date=${date}),0) as labour_spend,
      (select count(*) from material_entries where site_id=${siteId}::uuid and date=${date}) as material_count,
      coalesce((select sum(coalesce(cost,0)) from material_entries where site_id=${siteId}::uuid and date=${date}),0) as material_spend,
      (select count(*) from machinery_entries where site_id=${siteId}::uuid and date=${date}) as machinery_count,
      coalesce((select sum(coalesce(total_cost,0)) from machinery_entries where site_id=${siteId}::uuid and date=${date}),0) as machinery_spend,
      (select count(*) from expense_entries where site_id=${siteId}::uuid and date=${date}) as expense_count,
      coalesce((select sum(coalesce(amount,0)) from expense_entries where site_id=${siteId}::uuid and date=${date}),0) as expense_spend,
      (select count(*) from incident_reports where site_id=${siteId}::uuid and created_at::date=${date}) as incident_count
  `);
  const r = rows[0];
  return {
    labour: { todayCount: Number(r.labour_count), todaySpend: Number(r.labour_spend) },
    material: { todayCount: Number(r.material_count), todaySpend: Number(r.material_spend) },
    machinery: { todayCount: Number(r.machinery_count), todaySpend: Number(r.machinery_spend) },
    expense: { todayCount: Number(r.expense_count), todaySpend: Number(r.expense_spend) },
    incident: { todayCount: Number(r.incident_count), todaySpend: null },
  };
}

export async function getSiteOperationSummary(
  siteId: string, date = todayIsoDate(),
): Promise<SiteOperationSummary> {
  return getSiteOperationSummaryTx(db, siteId, date);
}
```

Remove the old `Promise.all` body of `getSiteOperationSummary`. Keep `todayIsoDate` import.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- operationSummary`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries/entries.ts lib/db/queries/operationSummary.test.ts
git commit -m "perf(db): getSiteOperationSummary computes counts/spend in SQL"
```

### 7c: dashboard — fold active+archived sites into one scan

**Files:**
- Modify: `lib/services/dashboard.ts:54-82`

- [ ] **Step 1: Replace the two site queries with one**

For admins, fetch all non-deleted sites in one query and partition in JS; archived is
admin-only so non-admins get `[]` without a query.

```typescript
// replace the Promise.all block in getDashboardData
const sitesPromise =
  user.role === "Admin"
    ? measureDbQuery(requestId, "dashboard.sitesAll", () =>
        db.select().from(sites).where(eq(sites.isDeleted, false)).orderBy(desc(sites.updatedAt)),
      )
    : measureDbQuery(requestId, "dashboard.sites", () =>
        db.select().from(sites).where(siteWhere).orderBy(desc(sites.updatedAt)),
      );

const [allSiteRows, notificationRows] = await Promise.all([
  sitesPromise,
  measureDbQuery(requestId, "dashboard.notifications", () =>
    db
      .select({
        id: notifications.notificationId,
        title: notifications.title,
        message: notifications.message,
        type: notifications.type,
        readAt: notifications.readAt,
      })
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(20),
  ),
]);

const siteRows =
  user.role === "Admin" ? allSiteRows.filter((s) => s.archivedAt === null) : allSiteRows;
const archivedRows =
  user.role === "Admin" ? allSiteRows.filter((s) => s.archivedAt !== null) : [];
```

Keep the rest (`unreadItems`, return shape) unchanged. `siteWhere` for non-admins already
excludes archived, so its `siteRows` equals `allSiteRows`. Drop the now-unused `isNotNull`
import if lint flags it.

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/services/dashboard.ts
git commit -m "perf(dashboard): single site scan, partition active/archived in JS"
```

---

## Task 8: Load repro — prove the freeze is gone

**Files:**
- Create: `scripts/repro-pool-wedge.mts`

- [ ] **Step 1: Write the repro script**

```typescript
// scripts/repro-pool-wedge.mts
// Reproduces the pool-exhaustion freeze and proves the fix. Fires N concurrent
// catalog requests each aborted after `abortMs`, then sends one final request and
// measures how long it takes. Before Fix 1/3: the final request hangs (or times
// out). After: it returns in well under a second.
// Run: BASE=http://127.0.0.1:3000 TOKEN=<bearer> node --import tsx scripts/repro-pool-wedge.mts
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const TOKEN = process.env.TOKEN;
const PATH = "/api/admin/catalog";
const N = Number(process.env.N ?? 15);
const ABORT_MS = Number(process.env.ABORT_MS ?? 1000);

const headers: Record<string, string> = TOKEN ? { authorization: `Bearer ${TOKEN}` } : {};

async function abortedHit() {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ABORT_MS);
  try {
    await fetch(BASE + PATH, { headers, signal: ac.signal });
  } catch {
    /* expected abort */
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  console.log(`firing ${N} aborted requests (abort @ ${ABORT_MS}ms)…`);
  await Promise.all(Array.from({ length: N }, abortedHit));

  console.log("sending final clean request, timing it…");
  const started = Date.now();
  const finalAc = new AbortController();
  const guard = setTimeout(() => finalAc.abort(), 30_000);
  try {
    const res = await fetch(BASE + PATH, { headers, signal: finalAc.signal });
    const ms = Date.now() - started;
    console.log(`final request: ${res.status} in ${ms}ms`);
    if (ms > 5000) console.error("SLOW — pool likely still wedging");
    else console.log("OK — pool healthy");
  } catch {
    console.error(`final request HUNG > 30s — pool exhausted (freeze reproduced)`);
    process.exitCode = 1;
  } finally {
    clearTimeout(guard);
  }
}

main();
```

Auth: get a bearer token via the Supabase password grant (handoff §"Auth for direct API
testing"); export it as `TOKEN`.

- [ ] **Step 2: Baseline RED (optional but recommended) — before applying Fix 1**

If you can test against a state without Fix 1 (e.g. `apply-statement-timeout.mts reset`
first), run the repro. Expected: final request HUNG > 30s, exit 1. Then re-apply Fix 1.

- [ ] **Step 3: GREEN — with Fix 1 + 2 + 3 in place**

Run: `node --import tsx scripts/repro-pool-wedge.mts`
Expected: `final request: 200 in <Nms>` with N < 5000; "OK — pool healthy".

- [ ] **Step 4: Commit**

```bash
git add scripts/repro-pool-wedge.mts
git commit -m "test: load repro proving pool-wedge fix"
```

---

## Task 9: Full verification + spec close-out

- [ ] **Step 1: Run the whole suite**

Run: `npm test -- --run && npm run lint`
Expected: all PASS (DB integration suites either pass against a reachable DB or skip cleanly).

- [ ] **Step 2: Manual end-to-end**

Start dev (`npm run dev`), open `/app/admin/catalog`, reload rapidly 10×, navigate away and
back. Expected: never stuck on "Loading catalog…"; each load sub-second. Repeat for the
dashboard.

- [ ] **Step 3: Confirm Fix 1 is live**

Run: `node --import tsx scripts/apply-statement-timeout.mts 30` (idempotent re-apply prints
`after: 30s`). Confirms the role timeout survived any DB restart.

- [ ] **Step 4: Update the spec status + handoff**

Edit `.docs/2026-06-22-db-pool-exhaustion-fix-spec.md` status → "Implemented & verified
<date>". Note the Analytics risk-gate decision (30s vs 60s) and whether Fix 3's cancellable
catalog variant landed or fell back to Fix 1 only.

- [ ] **Step 5: Commit**

```bash
git add .docs/2026-06-22-db-pool-exhaustion-fix-spec.md
git commit -m "docs: close out DB pool exhaustion fix"
```

---

## Self-review notes (for the implementer)

- **Schema column names in test inserts** (`users`, `sites`) are best-effort — read
  `lib/db/schema.ts` for exact NOT NULL columns before running Task 1/4/7 tests; fix inserts
  to satisfy constraints. The *assertions* are the contract, not the fixture boilerplate.
- **Fix 3 fallback is explicit** (Task 6 Step 5): if raw-SQL identifier interpolation is
  fiddly, ship Fix 1+2 and rely on the role timeout for the catalog query. The freeze is
  killed by Fix 1 regardless; Fix 3 is the refinement.
- **Labour SQL CASE must mirror `calculateLabourTotal`** exactly (split → stored → people×wage).
  Tasks 7a/7b tests assert equality against the JS helper — they are the guardrail.
- **Order matters:** Task 2 (export `client`) precedes Tasks 3/6 that import it.
