# Data Export + DB Performance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL — use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement task-by-task. Steps use checkbox (`- [ ]`) syntax. Tick them as you go so a fresh session can resume mid-plan.
> Commit after every task. End each commit message with:
> `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

**Decision context (why this plan, not Convex):** the app is deeply relational (23 tables, FK cascades, partial unique indexes, `DECIMAL(12,2)` money). Convex is a document store with `float64` numbers and no DB-enforced integrity — migrating would *trade away* the guarantees that protect the data and would not fix the perceived latency (which is a serverless+pooler connection problem, not Postgres being slow). We stay on Postgres and instead (A) fix baseline latency and (B/C) give the admin a real, off-platform backup + table export. Supabase **free tier has no trustworthy backup** (limited snapshots, project pauses after ~7 days idle, no PITR), so the manual full export *is* the data-loss insurance.

**Goal:**
- **A.** Diagnose and cut baseline DB round-trip latency ("not instant even when healthy").
- **B.** Admin-triggered **full JSON backup** — a consistent, re-importable snapshot of all tables, money preserved exactly.
- **C.** Admin per-table **CSV export** for table-view / spreadsheet analysis.

**Explicitly out of scope:** import of any kind, scheduled/cron backups, paid-tier PITR, Convex, any schema change.

**Tech stack:** Next 16 (App Router), drizzle-orm 0.45 + postgres.js 3.4 against Supabase transaction pooler (:6543), Vitest 3, sonner (toasts), motion.

**Prerequisite:** the [DB Pool Exhaustion Fix](./2026-06-22-db-pool-exhaustion-fix-plan.md) kills the *freeze* (orphaned queries + fan-out). It must be implemented first; this plan assumes the role-level `statement_timeout` (Fix 1) and `withStatementTimeout` guard are live. This plan does not duplicate it.

---

## Codebase facts this plan relies on (audited 2026-06-23)

- **Route wrapper** `lib/http/withApi.ts`: `withApi(handler)` and `withApiRoute<TCtx>(handler)`; handler receives `{ request, requestId }`; applies rate limit, request-id header, structured logging, and a catch-all 500.
- **Auth guard** `lib/auth/guards.ts`: `requireCapability(request, cap)` → `{ session }` on success or `{ error, status }` on failure (`session.user.id`, `session.user.role`). Denials auto-audit `permission.denied` via `after()`.
- **Capabilities** `lib/auth/capabilities.ts`: `Capability` union + `ADMIN_CAPABILITIES` / `SUPERVISOR_CAPABILITIES`. Admin-only caps are the ones present only in `ADMIN_CAPABILITIES`. `can(role, cap)`.
- **Read guard** `lib/db/guard.ts`: `withStatementTimeout(fn, timeoutMs=15000)` runs `fn(tx)` in a tx with `SET LOCAL statement_timeout`.
- **Audit** `lib/audit/log.ts`: `scheduleAudit(entry)` writes after the response via `after()`; never throws into the request.
- **Responses** `lib/errors/response.ts`: `successResponse`, `errorResponse(code, msg, status, details?, requestId)`. `ERROR_CODES` in `lib/errors/codes.ts`.
- **Admin subtree guard** `app/app/admin/layout.tsx`: 404s anyone lacking `resource:manage_all`. Pages under `/app/admin/*` are already admin-gated at render; API routes must still gate independently.
- **Admin nav** `components/app-shell/AdminTabNav.tsx`: tab array (`label`, `href`, `icon` from lucide-react); add a tab here.
- **Schema** `lib/db/schema.ts`: 23 `pgTable`s. Money is `decimal(...)` → **postgres.js returns numeric columns as strings**; `timestamp` → JS `Date`; `date` → `"YYYY-MM-DD"` string; `jsonb` → parsed object; `uuid`/`varchar`/`text` → string; `integer` identity ids are in safe JS range (no bigint columns).

---

## Architecture

```
                    ┌─────────────────────────────────────────┐
                    │  Admin "Data & Backups" page             │
                    │  /app/admin/data  (layout-guarded)       │
                    │  components/data-export/DataExportPanel  │
                    └───────────────┬─────────────────────────┘
                       fetch + blob download (NOT SWR — file)
                    ┌───────────────┴─────────────────────────┐
        GET /api/admin/export            GET /api/admin/export/[table]
        (full JSON backup)               (single-table CSV)
                    │                                 │
                    │  requireCapability("data:export")  + scheduleAudit
                    │                                 │
        ┌───────────┴──────────┐          ┌───────────┴───────────┐
        │ readFullSnapshot(tx) │          │ readTable(tx, key)    │
        │  ONE REPEATABLE READ │          │  allowlist key only   │
        │  tx, all 23 tables   │          └───────────┬───────────┘
        └───────────┬──────────┘                      │
                    │ rows (decimals as strings, Dates)│
        ┌───────────┴──────────┐          ┌───────────┴───────────┐
        │ toBackupJson(...)    │          │ toCsv(rows, columns)  │
        │  pure, deterministic │          │  pure, RFC4180 +      │
        │                      │          │  formula-injection    │
        └──────────────────────┘          └───────────────────────┘

  Single source of truth: lib/export/tableRegistry.ts
   - ordered FK-dependency list (parents before children → re-importable)
   - completeness test fails if a schema table is missing from the registry
```

**Key integrity decisions:**
- **Consistent snapshot:** the full backup reads every table inside **one `REPEATABLE READ` transaction** so no concurrent write can produce a torn / FK-inconsistent backup.
- **Money never touches a float:** decimals stay as the strings postgres.js returns; the JSON serializer and CSV writer must never `Number()` them. A test asserts `"1234.56"` survives verbatim.
- **Deterministic serialization:** `Date` → ISO-8601 UTC; `null` → `null`/empty; `jsonb` passed through unchanged.
- **Allowlist, never interpolation:** the per-table route maps the URL param to a registry entry (a drizzle table object). An unknown key is a 400 — no user string ever reaches SQL.
- **Forward-compat:** backup JSON carries `{ version, exportedAt }` so a future import can branch on shape.
- **Column names are camelCase:** `tx.select().from(table)` returns drizzle's camelCase property names, so JSON keys and CSV headers are `wagePerHead`, not `wage_per_head`. This is consistent across JSON, CSV, and empty-table headers (all derived from the same shape / `getTableColumns`). Intentional — documented so headers don't surprise anyone.
- **Testable executors:** `readFullSnapshot(exec?)` / `readTable(key, exec?)` accept an optional drizzle handle. Tests pass the `withRollback` tx so the seed and the read share one connection; production omits it and uses the pool (full snapshot in its own repeatable-read tx).

---

## File structure

Create:
- `lib/export/tableRegistry.ts` — ordered table registry (single source of truth).
- `lib/export/tableRegistry.test.ts` — completeness + ordering tests.
- `lib/export/serialize.ts` — pure JSON + CSV serializers.
- `lib/export/serialize.test.ts` — unit tests.
- `lib/export/snapshot.ts` — `readFullSnapshot(tx)` + `readTable(tx, key)`.
- `lib/export/snapshot.test.ts` — DB integration tests (describeDb).
- `app/api/admin/export/route.ts` — full JSON backup route.
- `app/api/admin/export/route.test.ts` — route auth + shape tests.
- `app/api/admin/export/[table]/route.ts` — per-table CSV route.
- `app/api/admin/export/[table]/route.test.ts` — route tests.
- `app/app/admin/data/page.tsx` — admin page (server component).
- `components/data-export/DataExportPanel.tsx` — client download UI.
- `scripts/measure-db-latency.mts` — Part A latency probe.

Modify:
- `lib/auth/capabilities.ts` — add `data:export` (admin-only).
- `components/app-shell/AdminTabNav.tsx` — add "Data" tab.
- `vercel.json` (create if absent) — Part A: pin function region to the DB region (only if measurement proves a mismatch).

---

# PHASE 0 — Prereqs & audit gate

### Task 0.1 — Confirm prerequisite is live
- [ ] Confirm the pool-exhaustion plan is implemented (role `statement_timeout` set; `withStatementTimeout` in use). If not, STOP and finish it first — this plan's long-running export tx depends on a sane timeout backstop.
- [ ] Run `npm run lint && npm test -- --run` on a clean tree. Record baseline green. (If suites are red before starting, fix or note before adding more.)

---

# PHASE 1 — Performance (baseline latency)

The freeze is handled by the prerequisite plan. This phase targets the *steady-state* "calls aren't instant" feeling. **Measure before changing anything.**

### Task 1.1 — Latency probe script
- [x] **Create `scripts/measure-db-latency.mts`.** It must, for BOTH `DATABASE_URL` (pooler :6543) and `DIRECT_URL` (direct :5432):
  1. time the first connection (cold TLS + pooler handshake),
  2. fire `SELECT 1` N=50 times sequentially, report p50/p95/max round-trip,
  3. run one representative app query (all non-deleted sites ordered by `updated_at`) and time it,
  4. print the resolved host so the region is identifiable.

```typescript
// scripts/measure-db-latency.mts
// Measures DB round-trip latency to locate the "not instant" cost: connection
// handshake vs per-query RTT vs query compute. Compares pooler (:6543) and direct
// (:5432). Run: node --import tsx scripts/measure-db-latency.mts
import "dotenv/config";
import postgres from "postgres";

const TARGETS = [
  ["pooler (DATABASE_URL)", process.env.DATABASE_URL],
  ["direct (DIRECT_URL)", process.env.DIRECT_URL],
] as const;

function pct(xs: number[], p: number) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

async function probe(label: string, url: string) {
  const host = new URL(url.replace("postgres://", "http://")).host;
  const sql = postgres(url, { max: 1, prepare: false, ssl: "require" });
  try {
    const t0 = Date.now();
    await sql`select 1`;                       // includes cold connect
    const coldMs = Date.now() - t0;

    const rtts: number[] = [];
    for (let i = 0; i < 50; i++) {
      const s = Date.now();
      await sql`select 1`;
      rtts.push(Date.now() - s);
    }
    const q0 = Date.now();
    await sql`select * from sites where is_deleted = false order by updated_at desc limit 200`;
    const queryMs = Date.now() - q0;

    console.log(`\n== ${label} == host=${host}`);
    console.log(`cold connect+query: ${coldMs}ms`);
    console.log(`SELECT 1 rtt p50=${pct(rtts, 50)}ms p95=${pct(rtts, 95)}ms max=${Math.max(...rtts)}ms`);
    console.log(`sites query: ${queryMs}ms`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

for (const [label, url] of TARGETS) {
  if (!url) { console.log(`skip ${label}: env not set`); continue; }
  await probe(label, url).catch((e) => console.error(`${label} failed:`, e.message));
}
```

- [x] **Run it** from a deployed-equivalent network if possible, and locally. Record numbers in this doc under "Measurement results" below.
- [x] Commit: `perf(db): add latency probe script`.

### Task 1.2 — Interpret + apply the targeted fix (decision gate)
Pick based on Task 1.1 numbers — **do not apply blindly**:
- [x] **If `SELECT 1` p50 RTT is high (≳40–80ms):** likely cross-region (Vercel function region ≠ Supabase region). Each request pays this × number of queries. Fix: colocate. Create/edit `vercel.json` `"regions": ["<supabase-region>"]` (e.g. `["bom1"]` if Supabase is `ap-south-1`). Re-measure from a deployed function. This is usually the biggest single win.
- [x] **If cold-connect is high but warm RTT is low:** the warm-client reuse in `lib/db/client.ts` already amortizes this on warm invocations. Consider raising `idle_timeout` and confirm the global client is actually reused on Vercel (log a connection-open counter). Evaluate session pooler (:5432) for this low-traffic profile if transaction-pooler handshakes dominate.
- [x] **If a specific app query is slow** (not RTT): capture it via `EXPLAIN ANALYZE`; confirm it hits an existing index in `schema.ts`. The schema is already heavily indexed — a miss means a query shape not covered; add a targeted index in a new migration (out of this plan's default scope — note it).
- [x] Record the decision + before/after numbers here. Commit any `vercel.json` change: `perf: colocate functions with DB region`.

> **Measurement results (measured 2026-06-23, from local dev machine):**
> - pooler: cold=537ms, rtt p50=43 / p95=49ms, sites=85ms, host=aws-1-ap-south-1.pooler.supabase.com:6543
> - direct: cold=597ms, rtt p50=43 / p95=45ms, sites=46ms, host=db.zcfjorpkilxpxqdmfmpw.supabase.co:5432
> - **Supabase region: ap-south-1 (Mumbai)** — confirmed from pooler host.
> - **Decision: colocate Vercel functions with the DB region.** `vercel.json` was ABSENT, so deployed
>   functions fall to Vercel's default `iad1` (US-East/Washington DC). With Supabase in ap-south-1, every
>   request crosses the Atlantic+ — the warm-RTT cost paid here locally (43ms machine→Mumbai) becomes
>   ~200ms+ × per-query on the deployed path, the plan's "biggest single win" scenario. Created
>   `vercel.json` with `"regions": ["bom1"]` (Mumbai = ap-south-1). The local cold-connect (~537ms) is
>   already amortized by the global-client reuse in `lib/db/client.ts` (idle_timeout 120s) — no change.
>   The `sites` query (85ms pooler / 46ms direct) hits an existing index — no index work needed.
>   **Deployed-region confirmed (2026-06-23):** after push, `curl -I https://site-ops-rho.vercel.app/...`
>   returns `x-vercel-id: bom1::…` on both `/api/health` and `/app/dashboard` — functions now run in bom1
>   (Mumbai), colocated with Supabase ap-south-1. Colocation verified; the structural cross-region penalty
>   is removed. Exact per-request ms delta NOT measured (DB-backed routes are auth-gated; no debug probe
>   route was added) — left to an authed end-to-end timing if a hard number is needed.

---

# PHASE 2 — Table registry (single source of truth)

### Task 2.1 — Registry
- [x] **Create `lib/export/tableRegistry.ts`.** Ordered array, parents before children (FK targets must appear before referencing tables), so a future import can insert in array order without violating FKs. Each entry: a stable string `key` (the physical table name) and the drizzle table object.

```typescript
// lib/export/tableRegistry.ts
// Single source of truth for what the backup/export covers and in what order.
// ORDER MATTERS: parents (FK targets) before children, so the JSON backup can be
// re-imported top-to-bottom without violating foreign keys. When you add a table
// to schema.ts, add it here too — tableRegistry.test.ts fails until you do.
import type { PgTable } from "drizzle-orm/pg-core";

import * as schema from "@/lib/db/schema";

export type TableEntry = { key: string; table: PgTable };

export const TABLE_REGISTRY: readonly TableEntry[] = [
  // level 0 — no FK deps
  { key: "user_profiles", table: schema.userProfiles },
  { key: "unit_master", table: schema.unitMaster },
  { key: "categories", table: schema.categories },
  // level 1 — depend on user_profiles / categories
  { key: "audit_logs", table: schema.auditLogs },
  { key: "sites", table: schema.sites },
  { key: "custom_labour_types", table: schema.customLabourTypes },
  { key: "custom_material_types", table: schema.customMaterialTypes },
  { key: "custom_machinery_types", table: schema.customMachineryTypes },
  { key: "subcategories", table: schema.subcategories },
  // level 2 — depend on sites / subcategories / custom types / unit_master
  { key: "custom_units", table: schema.customUnits },
  { key: "material_type_units", table: schema.materialTypeUnits },
  { key: "field_definitions", table: schema.fieldDefinitions },
  { key: "labour_entries", table: schema.labourEntries },
  { key: "material_entries", table: schema.materialEntries },
  { key: "machinery_entries", table: schema.machineryEntries },
  { key: "expense_entries", table: schema.expenseEntries },
  { key: "resource_requests", table: schema.resourceRequests },
  { key: "field_requests", table: schema.fieldRequests },
  { key: "incident_reports", table: schema.incidentReports },
  { key: "notifications", table: schema.notifications },
  { key: "resource_transfers", table: schema.resourceTransfers },
  { key: "push_subscriptions", table: schema.pushSubscriptions },
  // level 3 — depend on field_definitions
  { key: "generic_entries", table: schema.genericEntries },
];

export const TABLE_KEYS = TABLE_REGISTRY.map((t) => t.key);
export function getTableEntry(key: string): TableEntry | undefined {
  return TABLE_REGISTRY.find((t) => t.key === key);
}
```

### Task 2.2 — Completeness + ordering tests (write first, must fail, then make green)
- [x] **Create `lib/export/tableRegistry.test.ts`:**
  - Every `pgTable` exported from `schema.ts` appears in the registry (iterate `schema` exports, filter to objects that are pg tables via `getTableName`, assert each is present). **This is the guardrail against forgetting a table when the schema grows.**
  - No duplicate keys.
  - Each `key` equals the physical table name (`getTableName(entry.table) === entry.key`).
  - FK-ordering: for each table, every table it references (derive from FK metadata if available; otherwise assert against a small hardcoded dependency map) appears at a lower index.
- [x] Run `npm test -- tableRegistry` → green.
- [x] Commit: `feat(export): table registry + completeness test`.

---

# PHASE 3 — Pure serializers (JSON + CSV)

These are pure functions — fully unit-testable with no DB. **TDD: write `serialize.test.ts` first.**

### Task 3.1 — Tests first
- [x] **Create `lib/export/serialize.test.ts`** asserting:
  - **Decimal fidelity:** a row `{ amount: "1234.56" }` serializes to JSON containing the string `"1234.56"` (NOT `1234.56`, NOT `1234.5600001`).
  - **Date/timestamp:** a JS `Date` → ISO-8601 UTC string; a `"2026-06-22"` date string passes through unchanged.
  - **jsonb:** an object value is embedded unchanged.
  - **null:** stays `null` in JSON; becomes empty string in CSV.
  - **Backup shape:** `toBackupJson` produces `{ version, exportedAt, tables: { <key>: rows[] } }` with every registry key present (empty tables → `[]`).
  - **CSV RFC4180:** values with comma / double-quote / newline are wrapped in quotes and inner quotes doubled.
  - **CSV formula injection:** a cell starting with `=`, `@`, tab, or CR (e.g. `=cmd`, `@SUM`) is prefixed with `'` so a spreadsheet won't execute it.
  - **Negative money is NOT mangled:** `"-500.50"` stays `-500.50` (no `'` prefix) — the numeric guard exempts valid numbers. This is the data-integrity case the review caught; assert it explicitly.
  - **CSV header row** equals the column list; rows follow column order; nulls → empty.
- [x] Run `npm test -- serialize` → FAIL (not implemented).

### Task 3.2 — Implement
- [x] **Create `lib/export/serialize.ts`:**

```typescript
// lib/export/serialize.ts
// Pure serializers for the data export. No DB, no IO — deterministic and unit-tested.
// Money/decimal columns arrive as strings from postgres.js and MUST stay strings
// (never parsed through float) to preserve exact values.

export const BACKUP_VERSION = 1;

type Row = Record<string, unknown>;

// Normalize a single cell for JSON: Date -> ISO UTC; everything else unchanged
// (decimal strings, jsonb objects, null, numbers, booleans pass through).
function jsonCell(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  return v;
}

function normalizeRow(row: Row): Row {
  const out: Row = {};
  for (const k of Object.keys(row)) out[k] = jsonCell(row[k]);
  return out;
}

export function toBackupJson(
  tablesByKey: Record<string, Row[]>,
  keysInOrder: readonly string[],
  exportedAt = new Date(),
): string {
  const tables: Record<string, Row[]> = {};
  for (const key of keysInOrder) {
    tables[key] = (tablesByKey[key] ?? []).map(normalizeRow);
  }
  return JSON.stringify({ version: BACKUP_VERSION, exportedAt: exportedAt.toISOString(), tables });
}

// ---- CSV ----

const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else if (typeof v === "object") s = JSON.stringify(v); // jsonb -> compact JSON
  else s = String(v);

  // Formula-injection guard: neutralize cells a spreadsheet might execute — but
  // NOT legitimate numbers. Money is a decimal string, so a negative amount like
  // "-500.50" starts with "-"; prefixing it with "'" would turn it into un-summable
  // text and corrupt the data. Only neutralize non-numeric cells.
  const isNumeric = /^-?\d+(\.\d+)?$/.test(s);
  if (!isNumeric && s.length > 0 && FORMULA_PREFIXES.includes(s[0])) s = `'${s}`;

  // RFC 4180 quoting.
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(rows: Row[], columns: string[]): string {
  const header = columns.map(csvCell).join(",");
  const body = rows.map((r) => columns.map((c) => csvCell(r[c])).join(",")).join("\r\n");
  return rows.length ? `${header}\r\n${body}\r\n` : `${header}\r\n`;
}
```

- [x] Run `npm test -- serialize` → green.
- [x] Commit: `feat(export): pure JSON + CSV serializers`.

---

# PHASE 4 — Consistent DB snapshot reader

### Task 4.1 — Snapshot reader
- [x] **Create `lib/export/snapshot.ts`.** `readFullSnapshot` runs inside ONE transaction set to `REPEATABLE READ` (consistent, FK-coherent point-in-time) and raises the local `statement_timeout` (export legitimately scans every table). `readTable` reads a single registry table.

```typescript
// lib/export/snapshot.ts
// Reads table data for export. The full snapshot runs in ONE repeatable-read
// transaction so concurrent writes can't produce a torn / FK-inconsistent backup.
// The statement_timeout is raised locally because scanning every table is a
// legitimately longer operation than a normal request read.
//
// Both readers accept an optional `exec` (a drizzle handle or transaction). This
// is what makes them testable: integration tests pass the withRollback tx so
// seeded-but-uncommitted rows are visible (the seed and the read share ONE
// connection/tx). When `exec` is omitted, production uses the global pool.
import { getTableColumns, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { withStatementTimeout } from "@/lib/db/guard";
import { TABLE_REGISTRY, getTableEntry } from "@/lib/export/tableRegistry";

type Row = Record<string, unknown>;
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
const EXPORT_TIMEOUT_MS = 60_000;

async function readAll(tx: Executor): Promise<Record<string, Row[]>> {
  const out: Record<string, Row[]> = {};
  for (const { key, table } of TABLE_REGISTRY) {
    out[key] = (await tx.select().from(table)) as Row[];
  }
  return out;
}

export async function readFullSnapshot(exec?: Executor): Promise<Record<string, Row[]>> {
  // Test path: a tx was passed — run directly on it. Don't open a nested tx, which
  // would be a SAVEPOINT, and you cannot SET TRANSACTION ISOLATION LEVEL on a
  // savepoint. Isolation is irrelevant inside the test's rolled-back tx anyway.
  if (exec) return readAll(exec);
  // Production path: own repeatable-read tx for a consistent, FK-coherent snapshot.
  return db.transaction(
    async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${EXPORT_TIMEOUT_MS}`));
      return readAll(tx);
    },
    { isolationLevel: "repeatable read" },
  );
}

export async function readTable(
  key: string,
  exec?: Executor,
): Promise<{ rows: Row[]; columns: string[] }> {
  const entry = getTableEntry(key);
  if (!entry) throw new Error(`unknown table: ${key}`); // never reaches SQL (allowlist)
  const run = (tx: Executor) => tx.select().from(entry.table) as Promise<Row[]>;
  // Single-table read needs no isolation level, so production reuses the existing
  // withStatementTimeout guard. A passed tx (test) runs directly for visibility.
  const rows = exec ? await run(exec) : await withStatementTimeout(run, EXPORT_TIMEOUT_MS);
  // Stable column list even when empty, so CSV always has a header row.
  const columns = Object.keys(getTableColumns(entry.table));
  return { rows, columns };
}
```

> Note: `columns` uses `getTableColumns` for a stable header even on empty tables. The keys are drizzle's **camelCase** property names (e.g. `wagePerHead`), not DB snake_case — see the camelCase note under "Architecture". JSON, CSV, and the empty-table header are all consistent because they all come from the same select-result shape.

### Task 4.2 — Integration tests (describeDb + withRollback)
`lib/db/testing.ts` already exists and exports `describeDb`, `withRollback(fn(tx))`, and
`seedSite(tx)` (seeds a userProfile + site, returns `{ userId, siteId }`). **Both readers
must be called with the `withRollback` tx** — otherwise the read runs on the global pool and
cannot see the test's uncommitted rows (this was the HIGH bug the review caught).
- [x] **Create `lib/export/snapshot.test.ts`:**
  - In one `withRollback(async (tx) => …)`: `const { siteId } = await seedSite(tx)`, then insert ≥2 `labourEntries` for that `siteId` with a decimal wage like `"500.50"` (and confirm a negative-money case if any column allows it).
  - `await readFullSnapshot(tx)` returns an object with **all 23 registry keys present**.
  - The seeded `labour_entries` are found with the correct count.
  - The decimal column comes back as the exact string `"500.50"` (NOT a number).
  - `await readTable("labour_entries", tx)` returns the rows + a non-empty `columns` list whose keys are camelCase (e.g. includes `wagePerHead`).
  - `readTable("__nope__")` rejects (unknown key never reaches SQL).
- [x] Run `npm test -- snapshot` → green (auto-skips without `DATABASE_URL`).
- [x] Commit: `feat(export): consistent repeatable-read snapshot reader`.

---

# PHASE 5 — Capability + full JSON backup route

### Task 5.1 — Add the capability
- [x] In `lib/auth/capabilities.ts`: add `"data:export"` to the `Capability` union AND to `ADMIN_CAPABILITIES` only (admin-only; supervisors must not have it).
- [x] Run `npm run lint` → green (exhaustive matrix forces the addition to compile).
- [x] (Optional) add a tiny test asserting `can("Admin","data:export") === true` and `can("Supervisor","data:export") === false`.

### Task 5.2 — Full backup route
- [x] **Create `app/api/admin/export/route.ts`.** Mirror the catalog route's auth pattern. Gate on `data:export`. Set `maxDuration`. Audit the egress (full data export is sensitive — contains PII like phone/name).

```typescript
// app/api/admin/export/route.ts
import { scheduleAudit } from "@/lib/audit/log";
import { requireCapability } from "@/lib/auth/guards";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse } from "@/lib/errors/response";
import { readFullSnapshot } from "@/lib/export/snapshot";
import { TABLE_KEYS } from "@/lib/export/tableRegistry";
import { toBackupJson } from "@/lib/export/serialize";
import { withApi } from "@/lib/http/withApi";

// Generous ceiling for the whole-DB scan; raise in Vercel project settings if the
// data grows. Free-tier serverless caps wall-clock — see "Edge cases" if exports
// start timing out (trigger to move to streaming).
export const maxDuration = 60;

export const GET = withApi(async ({ request, requestId }) => {
  const auth = await requireCapability(request, "data:export");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
  }

  let snapshot;
  try {
    snapshot = await readFullSnapshot();
  } catch (err) {
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      "Backup export failed",
      500,
      undefined,
      requestId,
    );
  }

  const body = toBackupJson(snapshot, TABLE_KEYS);
  const rowCount = Object.values(snapshot).reduce((n, rows) => n + rows.length, 0);
  const filename = `siteops-backup-${new Date().toISOString().slice(0, 10)}.json`;

  scheduleAudit({
    actorUserId: auth.session.user.id,
    action: "data.export.full",
    resourceType: "backup",
    allowed: true,
    role: auth.session.user.role,
    metadata: { rowCount, tables: TABLE_KEYS.length },
  });

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
      "x-request-id": requestId,
    },
  });
});
```

### Task 5.3 — Route tests
- [x] **Create `app/api/admin/export/route.test.ts`.** Follow the project's existing route-test style (mock `requireCapability`/session as other route tests do — inspect a sibling under `app/api/admin/*` for the mocking convention). Assert:
  - supervisor / unauth → 403 / 401 (no body leak).
  - admin → 200, `content-disposition` attachment, body parses as JSON with `version`, `exportedAt`, and `tables` containing all `TABLE_KEYS`.
- [x] Run `npm test -- export` → green. `npm run lint` → green.
- [x] Commit: `feat(export): full JSON backup route (admin, audited)`.

---

# PHASE 6 — Per-table CSV route

### Task 6.1 — Route
- [x] **Create `app/api/admin/export/[table]/route.ts`** using `withApiRoute` (dynamic param). Validate the param against the registry allowlist (`getTableEntry`) — unknown → 400. Gate on `data:export`. Return CSV.

```typescript
// app/api/admin/export/[table]/route.ts
import { scheduleAudit } from "@/lib/audit/log";
import { requireCapability } from "@/lib/auth/guards";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse } from "@/lib/errors/response";
import { readTable } from "@/lib/export/snapshot";
import { getTableEntry } from "@/lib/export/tableRegistry";
import { toCsv } from "@/lib/export/serialize";
import { withApiRoute } from "@/lib/http/withApi";

export const maxDuration = 60;

type Ctx = { params: Promise<{ table: string }> };

export const GET = withApiRoute<Ctx>(async ({ request, requestId }, ctx) => {
  const auth = await requireCapability(request, "data:export");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
  }

  const { table } = await ctx.params;
  if (!getTableEntry(table)) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Unknown table", 400, undefined, requestId);
  }

  let csv: string;
  try {
    const { rows, columns } = await readTable(table);
    csv = toCsv(rows, columns);
    scheduleAudit({
      actorUserId: auth.session.user.id,
      action: "data.export.table",
      resourceType: "table",
      resourceId: table,
      allowed: true,
      role: auth.session.user.role,
      metadata: { rowCount: rows.length },
    });
  } catch {
    return errorResponse(ERROR_CODES.INTERNAL_ERROR, "Table export failed", 500, undefined, requestId);
  }

  const filename = `siteops-${table}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
      "x-request-id": requestId,
    },
  });
});
```

> Note: confirm the Next 16 dynamic-route param shape (`params` is a Promise in recent App Router). Match `withApiRoute<TCtx>`'s `TCtx` to whatever an existing dynamic admin route uses; adjust the `Ctx` type to the real shape.

### Task 6.2 — Route tests
- [x] **Create `app/api/admin/export/[table]/route.test.ts`:** admin + valid table → 200 `text/csv` with header row; unknown table → 400; supervisor → 403.
- [x] Run `npm test -- export` & `npm run lint` → green.
- [x] Commit: `feat(export): per-table CSV export route`.

---

# PHASE 7 — Admin UI

### Task 7.1 — Page
- [x] **Create `app/app/admin/data/page.tsx`** (server component; `/app/admin/*` layout already enforces admin → 404 otherwise). Header "Data & Backups" + render `<DataExportPanel />`. Mirror the heading style of `app/app/admin/catalog/page.tsx`.

### Task 7.2 — Download panel
- [x] **Create `components/data-export/DataExportPanel.tsx`** (`'use client'`). NOT SWR — these are file downloads. Use `fetch` → `blob` → object URL → anchor click, with loading + error states (toast via `sonner`). One button "Download full backup (JSON)" hitting `/api/admin/export`; a list/select of `TABLE_KEYS` each linking `/api/admin/export/<key>` for CSV. Copy should warn the backup contains all data including user contact info, and tell the admin to store it somewhere safe (this is the off-platform insurance).

```typescript
'use client';
import { useState } from "react";
import { toast } from "sonner";
import { TABLE_KEYS } from "@/lib/export/tableRegistry";

async function download(url: string, fallbackName: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const name =
    res.headers.get("content-disposition")?.match(/filename="(.+?)"/)?.[1] ?? fallbackName;
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href; a.download = name; a.click();
  URL.revokeObjectURL(href);
}

export function DataExportPanel() {
  const [busy, setBusy] = useState<string | null>(null);
  const run = (key: string, url: string, name: string) => async () => {
    setBusy(key);
    try { await download(url, name); toast.success("Download started"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Export failed"); }
    finally { setBusy(null); }
  };
  // ...render full-backup button + per-table CSV list, disabled while busy...
}
```

- [x] Apply the project's existing styling idiom (Tailwind classes consistent with admin components). Use `lib/ui` helpers if present.

### Task 7.3 — Nav tab
- [x] In `components/app-shell/AdminTabNav.tsx` add `{ label: 'Data', href: '/app/admin/data', icon: Database }` (import `Database` from `lucide-react`).

### Task 7.4 — Manual verification
- [ ] `npm run dev`, sign in as Admin, open `/app/admin/data`.
- [ ] Full backup downloads; open the JSON — confirm `version`, `exportedAt`, all 23 table keys, and a money value is an exact string (e.g. `"500.50"`).
- [ ] A per-table CSV downloads and opens cleanly in a spreadsheet; verify a value beginning with `=`/`-` is neutralized (leading `'`), and a value with a comma is quoted.
- [ ] Sign in as Supervisor → `/app/admin/data` 404s; hitting `/api/admin/export` directly → 403.
- [ ] Commit: `feat(export): admin Data & Backups page + nav`.

---

# PHASE 8 — Hardening & full verification

### Task 8.1 — Edge cases & race conditions (review checklist)
Confirm each is handled; add a test or note where relevant:
- [x] **Snapshot consistency:** full backup is one `REPEATABLE READ` tx — no torn FK state from concurrent writes. (Verified by design; spot-check the SET TRANSACTION took effect.)
- [x] **Decimal/money fidelity:** strings end-to-end; covered by `serialize.test.ts` + `snapshot.test.ts`.
- [x] **Date/timestamp determinism:** ISO-8601 UTC; covered by serializer test.
- [x] **jsonb passthrough** (`audit_logs.metadata`, `field_definitions.options`, `generic_entries.value`): embedded unchanged in JSON; compact-JSON in CSV.
- [x] **Empty tables:** JSON `[]`; CSV header-only. Covered.
- [x] **CSV formula injection** + **RFC4180 quoting:** covered by serializer test.
- [x] **Unknown table param:** 400, allowlist only — no user string reaches SQL. Covered by route test.
- [x] **Auth:** both routes gate `data:export` independently of the page layout guard; 401/403 tested.
- [x] **Audit:** every export writes an audit row (`data.export.full` / `data.export.table`) with row counts; audit never breaks the request (`scheduleAudit`).
- [x] **Rate limiting:** `withApi` applies the global limit. Export is expensive — consider a tighter per-route limit if abuse is a concern (note as optional; `lib/rateLimit/guard.ts`).
- [x] **Function timeout / memory (the real growth risk):** v1 buffers the whole snapshot in memory and serializes in one shot — fine at free-tier scale. **Trigger to upgrade to streaming:** if the full export approaches `maxDuration` or memory limits, switch `readFullSnapshot` to stream table-by-table through a `ReadableStream` (open a cursor per table within the repeatable-read tx, write each as a JSON array chunk). Documented here so a future session knows the upgrade path and its trigger.
- [x] **Filename safety:** fixed, date-derived filenames — no user input in `Content-Disposition`.
- [x] **No bigint overflow:** identity `id`s are `integer` (safe in JS). Confirmed against schema.
- [x] **Concurrency:** admin-only + low volume; each export uses one pooled connection (pool `max: 15`); `statement_timeout` raise is `SET LOCAL` so it never leaks to other pooled sessions.

### Task 8.2 — Full suite + close-out
- [x] `npm test -- --run && npm run lint` → all green (DB suites pass against a reachable DB or skip cleanly).
- [ ] Update this doc: tick all phases, fill "Measurement results", and set status to "Implemented & verified <date>".
- [ ] Commit: `docs: close out data export + perf plan`.

---

# PHASE 9 — Security hardening (from 2026-06-23 security review)

Separate concern from export/perf, but surfaced during this review cycle and tracked here.
Each item was cross-verified against the codebase + `npm audit`. Do these independently of
Phases 1–8 (no ordering dependency).

### Task 9.1 — Strip inbound `x-siteops-*` unconditionally (defense-in-depth) [MEDIUM]
**Verified:** `proxy.ts` early-returns `NextResponse.next()` for public prefixes (`/api/health`,
`/api/webhooks/`) and `OPTIONS` **without** stripping inbound auth headers. Not exploitable today
(no public handler reads session), but a landmine: any future handler under those prefixes that
reads `getSessionUserFromHeaders` would trust attacker-supplied `x-siteops-user-id` /
`x-siteops-user-role`.
- [ ] At the very top of `proxy()` (before the public-prefix and OPTIONS branches), build a
  sanitized header set that **deletes** `AUTH_USER_ID_HEADER`, `AUTH_USER_EMAIL_HEADER`,
  `AUTH_USER_ROLE_HEADER` from the inbound request, and use it for ALL exits — including the
  early `NextResponse.next()` returns. The authed path then re-sets them from verified claims as
  it already does.
- [ ] Test: a request to `/api/health` carrying forged `x-siteops-user-role: Admin` reaches the
  handler with that header absent.
- [ ] Commit: `fix(security): strip inbound auth headers on all proxy exits`.

> **Not changed (reviewed, rejected):** defaulting a missing role to `Supervisor`
> (`session.ts:32`). `Supervisor` is the **lowest-privilege** role, so the default is fail-safe,
> not an escalation. Optional future tightening: treat a verified session with no role claim as
> unauthenticated. Low priority — not a vulnerability.

### Task 9.2 — Auth brute-force throttling [MEDIUM]
**Verified:** `app/api/auth/change-password` already runs under `withApi` → `applyRateLimit` (no
change needed there). The gap is sign-in / sign-up: they call Supabase **directly from the
browser**, bypassing the app's Upstash limiter — brute-force protection is Supabase defaults only.
- [ ] Tighten Supabase Auth rate limits in the dashboard (per-IP sign-in attempts, OTP, etc.).
- [ ] (Optional) route sign-in through a thin server endpoint wrapped in `withApi` so the Upstash
  limiter applies app-side; weigh against the simplicity of the current direct-to-Supabase flow.
- [ ] Commit (if server endpoint added): `feat(security): server-side rate limit on sign-in`.

### Task 9.3 — Promote CSP to enforcing + add HSTS [MEDIUM]
**Verified:** `next.config.ts` ships `Content-Security-Policy-Report-Only` with
`script-src 'self' 'unsafe-inline' 'unsafe-eval'` and no `Strict-Transport-Security`.
- [ ] Review collected CSP violation reports; resolve inline-script/style sources.
- [ ] Move to nonce-based `script-src` (Next supports nonces); **drop `'unsafe-eval'`** in prod if
  nothing requires it (test thoroughly — some libs/dev tooling need it).
- [ ] Flip the header name to enforcing `Content-Security-Policy`.
- [ ] Add `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` to
  `securityHeaders`.
- [ ] Manual verify: app functions with enforcing CSP; no console CSP errors; `curl -I` shows HSTS.
- [ ] Commit: `feat(security): enforcing CSP with nonces + HSTS`.

### Task 9.4 — Patch transitive `postcss` advisory + audit in CI [LOW/MODERATE]
**Verified:** `npm audit` reports `next → postcss@8.4.31` moderate — *"PostCSS XSS via Unescaped
`</style>` in CSS Stringify Output."* Top-level postcss is already `8.5.10`. Real exposure is low
(build/SSR stringify of first-party CSS), fix is trivial.
- [ ] Add to `package.json`: `"overrides": { "postcss": ">=8.5.10" }`; `npm install`; confirm
  `npm ls postcss` shows no `8.4.31` and `npm audit` no longer flags postcss.
- [ ] Add `npm audit --omit=dev --audit-level=high` (or a reviewed threshold) as a CI gate so new
  advisories surface. Note the remaining `esbuild`/`drizzle-kit` advisories are **dev-server only**
  — decide whether to gate on them or document as accepted dev-only risk.
- [ ] Commit: `chore(security): override postcss to patched version + CI audit`.

---

## Self-review notes (for the implementer)
- **Prerequisite is load-bearing:** the export's long tx relies on the role-level `statement_timeout` from the pool-exhaustion plan. Do Phase 0 honestly.
- **Resolved from review (2026-06-23):**
  - Readers thread an optional `exec` so integration tests (which seed in an uncommitted `withRollback` tx) can actually see their rows. Without this the snapshot test could never pass.
  - `readFullSnapshot` only opens its own tx (with `{ isolationLevel: "repeatable read" }`) when no `exec` is passed — never nests inside the test tx, sidestepping the "can't SET ISOLATION on a savepoint" trap.
  - `getTableColumns` (real drizzle export) gives empty-table headers — the `_` hack is gone.
  - CSV formula guard exempts valid numbers (`/^-?\d+(\.\d+)?$/`) so negative money like `-500.50` is not corrupted into text. Single most important fidelity fix in the review.
- **Route-test mocking:** copy the auth/session mocking convention from an existing `app/api/admin/*` route test rather than inventing one.
- **Registry is the contract:** the completeness test (Task 2.2) is what keeps backups whole as the schema grows — never weaken it.
- **Money string fidelity is the single most important invariant** in this plan; if any test ever coerces a decimal to `number`, that's a data-integrity regression, not a test convenience.
```
