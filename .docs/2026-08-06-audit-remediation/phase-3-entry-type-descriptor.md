# Phase 3 — Make "entry type" a real module (`EntryTypeDescriptor`)

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the concept "entry type" one home per concern instead of eleven parallel encodings, so that a single conceptual change ("materials now track a supplier") is a single-file change.

**Architecture:** Two descriptor registries, deliberately split by runtime boundary — `lib/entryTypes/server.ts` (table, id column, date expression, decimal fields, spend SQL + spend TS, zod schemas) and `lib/entryTypes/client.ts` (label, icon key, form fields, category key, summary renderer). Both keyed by the same `EntryType` union, which moves to `lib/types/entry.ts`. Callers do `descriptorFor(type)` lookups instead of switching. **Migrate one concern at a time**; each of the four steps ships independently behind the existing test suite.

**Tech stack:** TypeScript 5.8 (`satisfies`, const type parameters), drizzle-orm, zod 4, React 19, vitest 3.

**Covers audit findings:** F7 (root cause), F9 (`entries.ts` switch collapse), F10 (labour-spend unification), F18 (field metadata SSOT). Also unblocks F13 in Phase 4.

---

## Read this before starting

This is the largest phase and the one most able to cause silent damage. Three rules:

1. **Never change behaviour and shape in the same commit.** Every step is: introduce the descriptor data, prove it equals the old data with a test, *then* delete the old encoding.
2. **The richest test coverage in the repo protects this work.** `entries.test.ts`, `entryFormat.test.ts`, `mapEntryToFormValues.test.ts`, `entryFieldRegistry.test.ts`, `typeStyles.test.ts`, `schemas.test.ts`, `allOperationsView.test.ts`, `categoryView.test.ts`, plus the DB-backed `operationSummary.test.ts` and `sites.spend.test.ts`. If a step makes any of these fail, the step is wrong — do not edit the test to match.
3. **Server modules must not import client modules.** That is why the descriptor is split in two. A single `lib/entryTypes/index.ts` that re-exports both would drag JSX and lucide icons into route handlers.

**Blocking check — the audit says do not start this while the global-work-stage branch is uncommitted.** Verified 2026-08-06: that work **landed** in commit `4c069c8` and the tree is clean. This phase is unblocked. Re-verify with `git status --short` anyway before you begin.

---

## The three non-negotiables (verified against the tree)

1. **Incident is a fifth type in some layers and absent from others.** It has DB read/write/delete, display, and search presence, and it *does* have a form-field entry in `entryFieldRegistry.REGISTRY.incident` (`:110-128`) — the audit says it has "no create form", which is **wrong**; it has fields but no `date` field in that list. It has **no spend**. So: `spend` members must be nullable, and the form-field member is present for all five.
2. **Incident's date is `created_at::date`**, not a `date` column (`entries.ts:585-590`, `entryFormat.entryDate` `:96-101`, `siteOperationSummary` `:543`). Model this as an explicit per-descriptor date accessor + SQL expression, never as a shared assumption.
3. **The `getEntryById(id, type)` return type is a discriminated union today.** A naive `Record<EntryType, table>` map loses narrowing and every caller degrades to `any`. Preserve narrowing with a `RowByType` lookup type and a generic signature (Task 3 shows exactly how).

---

## Global constraints

Read [README.md § Global constraints](README.md#global-constraints-apply-to-every-phase-every-task). Phase-specific:

- Drizzle requires the **concrete table object** for `db.update(table)` / `db.delete(table)` — descriptor values must be the actual schema exports, never table-name strings.
- `updateEntryById` uses `.returning()`. Preserve it; callers use the returned row.
- `updateEntryById` also strips immutable columns by destructuring (`entries.ts:368-379`). That is a **security control** (mass-assignment prevention). It must survive the refactor exactly — see Task 3's checklist.
- Zod is **v4**. Do not attempt to read constraints out of `_def` at runtime; that was a zod-3 idea and is brittle in any version. Task 6 uses shared constants consumed by both the schema builder and the field registry.
- Run tests as `npm run test -- --testTimeout=30000`.

---

## Pre-flight

- [x] **P0.1** Phase 2 merged (it rewrote all four entry POST routes; this phase touches their query layer).
- [x] **P0.2** `git status --short` clean (except `public/sw.js`).
- [x] **P0.3** Green baseline: `npm run lint && npm run test -- --testTimeout=30000 2>&1 | tail -20`. **Write the pass count down** — you will compare against it after every task.
- [x] **P0.4** Read the contract tests before writing any code:
  ```bash
  sed -n '1,80p' lib/db/queries/entries.test.ts
  sed -n '1,60p' components/operations/entryFormat.test.ts
  ```
- [x] **P0.5** `git checkout -b phase-3-entry-type-descriptor`.

---

## File structure for this phase

| File | Change | Responsible for |
|---|---|---|
| `lib/types/entry.ts` | Modify | Becomes the home of `EntryType`, `MaterialWorkStage`, `RowByType` (it already holds the row types) |
| `lib/entryTypes/server.ts` | **Create** | Server descriptor: table, idColumn, dateColumn/dateExpr, decimalFields, spendExpr, spendOf, zodCreate, zodUpdate, catalogFields |
| `lib/entryTypes/server.test.ts` | **Create** | Shape completeness + parity with the encodings being replaced |
| `lib/entryTypes/client.ts` | **Create** | Client descriptor: label, iconKey, formFields, endpoint, idField, categoryKey, gridCategoryKey |
| `lib/entryTypes/client.test.ts` | **Create** | Parity with `typeLabel`, `entryId`, `gridCategoryKey`, `entryFieldRegistry` |
| `lib/entryTypes/constraints.ts` | **Create** | Numeric field constraints shared by the zod schemas and the field registry (F18) |
| `lib/db/queries/entries.ts` | Modify | Switches collapse to descriptor lookups; re-exports `EntryType` for one release |
| `lib/services/entries.ts` | Modify | `decimalFieldsFor` delegates to the descriptor |
| `lib/services/labourSpend.ts` | **Create** | The single TS labour-spend function (F10) |
| `components/operations/entryFormat.tsx` | Modify | `entryId`, `typeLabel`, `gridCategoryKey`, `entrySpend` delegate to the client descriptor |
| `components/logs/entryFieldRegistry.ts` | Modify | Registry becomes the descriptor's `formFields` source, constraints imported |
| `lib/validation/schemas.ts` | Modify | Numeric bounds imported from `constraints.ts` |
| `app/api/entries/[id]/route.ts` | Modify | Schema ternary + catalog-field list become descriptor lookups |

---

## Step 1 — Table / id-column / date maps (F9)

### Task 1 — Move the type vocabulary to `lib/types/entry.ts`

**Files:**
- Modify: `lib/types/entry.ts`
- Modify: `lib/db/queries/entries.ts`

**Interfaces:**
- Produces: `export type EntryType`, `export type MaterialWorkStage`, `export type RowByType` from `@/lib/types/entry`. Every later task imports from there.

**Why first:** the descriptor modules need `EntryType`, and importing it from `lib/db/queries/entries` would make `lib/entryTypes/client.ts` root its type graph in the Drizzle layer — the exact seam leak Phase 4 (F13) exists to fix.

- [x] **Step 1: Add the types to `lib/types/entry.ts`**

Append:

```ts
export type EntryType = "labour" | "material" | "machinery" | "expense" | "incident";

// Now a managed catalog list (was a pg enum), so any active value is valid.
export type MaterialWorkStage = string;

// Lookup type that keeps getEntryById/updateEntryById narrowing per type.
// Without this, collapsing the per-type switches into a table map degrades
// every caller's row type to a union or to any.
export type RowByType = {
  labour: LabourEntryRow;
  material: MaterialEntryRow;
  machinery: MachineryEntryRow;
  expense: ExpenseEntryRow;
  incident: IncidentEntryRow;
};
```

- [x] **Step 2: Re-export from the old location so nothing breaks yet**

In `lib/db/queries/entries.ts`, replace the local declarations (`:302-310`) with:

```ts
// Vocabulary moved to lib/types/entry.ts so client modules can import it
// without rooting their type graph in the Drizzle layer (audit F13).
// Re-exported here for one release; remove once all imports are updated.
export type { EntryType, MaterialWorkStage } from "@/lib/types/entry";
```
and add `import type { EntryType, MaterialWorkStage, RowByType } from "@/lib/types/entry";` at the top.

- [x] **Step 3: Verify — nothing should change**

```bash
npm run lint && npm run test -- --testTimeout=30000
```
Expected: identical to baseline. A `tsc` error here means a circular import — `lib/types/entry.ts` imports table *types* from `@/lib/db/schema` (type-only, already the case), and `entries.ts` imports types from it. That is acyclic. If you see a cycle, you added a runtime import somewhere.

- [x] **Step 4: Commit**
```bash
git add lib/types/entry.ts lib/db/queries/entries.ts
git commit -m "refactor(types): move EntryType vocabulary to lib/types/entry"
```

---

### Task 2 — The server descriptor's table/id/date members

**Files:**
- Create: `lib/entryTypes/server.ts`
- Create: `lib/entryTypes/server.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type EntryTypeServerDescriptor = {
    type: EntryType;
    table: AnyPgTable;
    idColumn: PgColumn;
    idField: string;                    // e.g. "labourEntryId"
    dateColumn: PgColumn | null;        // null for incident
    dateExpr: SQL;                      // date col, or created_at::date
    decimalFields: readonly string[];
    hasSpend: boolean;
  };
  export const ENTRY_TYPES: readonly EntryType[];
  export function serverDescriptorFor(type: EntryType): EntryTypeServerDescriptor;
  ```
  Tasks 3, 4, 5 and 7 consume it.

- [x] **Step 1: Write the failing test**

Create `lib/entryTypes/server.test.ts`:

```ts
import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { ENTRY_TYPES, serverDescriptorFor } from "./server";
import { decimalFieldsFor } from "@/lib/services/entries";

describe("server entry-type descriptors", () => {
  it("covers exactly the five entry types", () => {
    expect([...ENTRY_TYPES].sort()).toEqual(
      ["expense", "incident", "labour", "machinery", "material"],
    );
  });

  it("maps each type to the right table", () => {
    expect(getTableName(serverDescriptorFor("labour").table)).toBe("labour_entries");
    expect(getTableName(serverDescriptorFor("material").table)).toBe("material_entries");
    expect(getTableName(serverDescriptorFor("machinery").table)).toBe("machinery_entries");
    expect(getTableName(serverDescriptorFor("expense").table)).toBe("expense_entries");
    expect(getTableName(serverDescriptorFor("incident").table)).toBe("incident_reports");
  });

  it("maps each type to its primary-key field name", () => {
    expect(serverDescriptorFor("labour").idField).toBe("labourEntryId");
    expect(serverDescriptorFor("material").idField).toBe("materialEntryId");
    expect(serverDescriptorFor("machinery").idField).toBe("machineryEntryId");
    expect(serverDescriptorFor("expense").idField).toBe("expenseEntryId");
    expect(serverDescriptorFor("incident").idField).toBe("incidentReportId");
  });

  it("gives incident a null dateColumn — it has no date column", () => {
    expect(serverDescriptorFor("incident").dateColumn).toBeNull();
    for (const type of ["labour", "material", "machinery", "expense"] as const) {
      expect(serverDescriptorFor(type).dateColumn, type).not.toBeNull();
    }
  });

  it("marks incident as spendless and the other four as spend-bearing", () => {
    expect(serverDescriptorFor("incident").hasSpend).toBe(false);
    for (const type of ["labour", "material", "machinery", "expense"] as const) {
      expect(serverDescriptorFor(type).hasSpend, type).toBe(true);
    }
  });

  // Parity guard: the descriptor must agree with the encoding it replaces,
  // until that encoding is deleted in a later task.
  it("agrees with decimalFieldsFor for every type", () => {
    for (const type of ENTRY_TYPES) {
      expect([...serverDescriptorFor(type).decimalFields].sort(), type)
        .toEqual([...decimalFieldsFor(type)].sort());
    }
  });
});
```

- [x] **Step 2: Run — expect FAIL.**

- [x] **Step 3: Implement**

Create `lib/entryTypes/server.ts`:

```ts
import { sql, type SQL } from "drizzle-orm";
import type { AnyPgTable, PgColumn } from "drizzle-orm/pg-core";

import {
  expenseEntries,
  incidentReports,
  labourEntries,
  machineryEntries,
  materialEntries,
} from "@/lib/db/schema";
import type { EntryType } from "@/lib/types/entry";

// One descriptor per entry type, server half. Everything here is safe to import
// from a route handler or a query module; the client half (labels, icons, JSX
// summaries, form fields) lives in ./client so server code never pulls React in.
//
// Incident is a genuine fifth type but is spendless and has no `date` column —
// it filters on created_at::date. Those two asymmetries are modelled
// explicitly (`hasSpend`, `dateColumn: null` + `dateExpr`) rather than
// special-cased at each call site, which is what the switches used to do.
export type EntryTypeServerDescriptor = {
  type: EntryType;
  table: AnyPgTable;
  idColumn: PgColumn;
  idField: string;
  dateColumn: PgColumn | null;
  dateExpr: SQL;
  decimalFields: readonly string[];
  hasSpend: boolean;
};

const DESCRIPTORS = {
  labour: {
    type: "labour",
    table: labourEntries,
    idColumn: labourEntries.labourEntryId,
    idField: "labourEntryId",
    dateColumn: labourEntries.date,
    dateExpr: sql`${labourEntries.date}`,
    decimalFields: ["wagePerHead", "salaryAmount", "masonSalaryAmount", "helperSalaryAmount"],
    hasSpend: true,
  },
  material: {
    type: "material",
    table: materialEntries,
    idColumn: materialEntries.materialEntryId,
    idField: "materialEntryId",
    dateColumn: materialEntries.date,
    dateExpr: sql`${materialEntries.date}`,
    decimalFields: ["quantity", "cost"],
    hasSpend: true,
  },
  machinery: {
    type: "machinery",
    table: machineryEntries,
    idColumn: machineryEntries.machineryEntryId,
    idField: "machineryEntryId",
    dateColumn: machineryEntries.date,
    dateExpr: sql`${machineryEntries.date}`,
    decimalFields: ["hoursActive", "totalCost"],
    hasSpend: true,
  },
  expense: {
    type: "expense",
    table: expenseEntries,
    idColumn: expenseEntries.expenseEntryId,
    idField: "expenseEntryId",
    dateColumn: expenseEntries.date,
    dateExpr: sql`${expenseEntries.date}`,
    decimalFields: ["amount"],
    hasSpend: true,
  },
  incident: {
    type: "incident",
    table: incidentReports,
    idColumn: incidentReports.incidentReportId,
    idField: "incidentReportId",
    // No `date` column — the whole app filters incidents on created_at cast to
    // a date, so a YYYY-MM-DD upper bound still includes same-day entries.
    dateColumn: null,
    dateExpr: sql`${incidentReports.createdAt}::date`,
    decimalFields: [],
    hasSpend: false,
  },
} satisfies Record<EntryType, EntryTypeServerDescriptor>;

export const ENTRY_TYPES = Object.keys(DESCRIPTORS) as readonly EntryType[];

export function serverDescriptorFor(type: EntryType): EntryTypeServerDescriptor {
  return DESCRIPTORS[type];
}
```

- [x] **Step 4: Run — expect PASS.** `npm run test -- --testTimeout=30000 lib/entryTypes/server.test.ts`

- [x] **Step 5: Commit**
```bash
git add lib/entryTypes/server.ts lib/entryTypes/server.test.ts
git commit -m "feat(entryTypes): add server descriptor with table/id/date/decimal members"
```

---

### Task 3 — Collapse `getEntryById` / `updateEntryById` / `deleteEntryById`

**Files:**
- Modify: `lib/db/queries/entries.ts`

**~150 lines become ~35.** This is the mechanical core of F9.

**Type-safety requirement:** the three functions currently return a narrowed row type per case. Preserve that with generics + `RowByType`, or every caller silently loses its types and the next bug is a runtime `undefined`.

- [x] **Step 1: Read the contract test first**

```bash
sed -n '1,120p' lib/db/queries/entries.test.ts
```
Note every assertion about these three functions. Do not proceed until you can state what they promise.

- [x] **Step 2: Replace `getEntryById`**

```ts
export async function getEntryById<T extends EntryType>(
  entryId: string,
  type: T,
): Promise<RowByType[T] | null> {
  const d = serverDescriptorFor(type);
  if (!d) return null;
  const r = await db.select().from(d.table).where(eq(d.idColumn, entryId));
  // The descriptor map guarantees table↔type correspondence; the cast is the
  // one place that knowledge crosses from data into the type system.
  return (r[0] as RowByType[T] | undefined) ?? null;
}
```

**The `default: return null` case:** the old switch had one. `serverDescriptorFor` is total over `EntryType`, so a `default` is unreachable for well-typed callers — but `type` arrives from a URL query string in `app/api/entries/[id]/route.ts`. That route already validates it in `parseType` (`:49-62`) before calling. Keep the `if (!d) return null` guard anyway as defence in depth for any caller that skips validation; it costs nothing and preserves the old behaviour exactly.

- [x] **Step 3: Replace `updateEntryById`**

```ts
export async function updateEntryById<T extends EntryType>(
  entryId: string,
  type: T,
  data: Record<string, unknown>,
): Promise<RowByType[T] | null> {
  // SECURITY: strip fields that must never change after creation, so a crafted
  // PATCH body cannot reassign an entry to another site or another author.
  // This destructuring is a mass-assignment control — do not "simplify" it into
  // a descriptor-driven allowlist without re-deriving the full deny set.
  const {
    siteId: _siteId,
    createdBy: _createdBy,
    reportedBy: _reportedBy,
    labourEntryId: _labourId,
    materialEntryId: _materialId,
    machineryEntryId: _machineryId,
    expenseEntryId: _expenseId,
    incidentReportId: _incidentId,
    id: _id,
    ...safeData
  } = data;

  const d = serverDescriptorFor(type);
  if (!d) return null;
  const r = await db
    .update(d.table)
    .set({ ...safeData, updatedAt: new Date() })
    .where(eq(d.idColumn, entryId))
    .returning();
  return (r[0] as RowByType[T] | undefined) ?? null;
}
```

**Do not** replace the destructuring with `omit(data, d.immutableFields)`. The current deny-list strips **all five** id fields regardless of type — so a PATCH on a labour entry cannot smuggle `materialEntryId`. A per-type list would strip only that type's id and widen the attack surface.

- [x] **Step 4: Replace `deleteEntryById`**

```ts
export async function deleteEntryById<T extends EntryType>(
  entryId: string,
  type: T,
): Promise<RowByType[T] | null> {
  const d = serverDescriptorFor(type);
  if (!d) return null;
  const r = await db.delete(d.table).where(eq(d.idColumn, entryId)).returning();
  return (r[0] as RowByType[T] | undefined) ?? null;
}
```

- [x] **Step 5: Run the contract tests — expect identical results**

```bash
npm run test -- --testTimeout=30000 lib/db/queries/entries.test.ts
npm run lint
```

- [x] **Step 6: Confirm callers kept their narrowing**

```bash
npm run lint
```
`tsc` is the check. Specifically confirm `app/api/entries/[id]/route.ts` still type-checks where it casts `existing as LabourEntryRow` (`:137`) and `existing as MaterialEntryRow` (`:154`) — if those casts became necessary where they weren't, or stopped compiling, the generic signature is wrong.

- [x] **Step 7: Measure the win**
```bash
wc -l lib/db/queries/entries.ts
```
Expect ~600 (from 710).

- [x] **Step 8: Commit**
```bash
git add lib/db/queries/entries.ts
git commit -m "refactor(db): collapse entry get/update/delete switches into descriptor lookups"
```

---

### Task 4 — Collapse the four clone fetchers in `getEntriesBySite`

**Files:**
- Modify: `lib/db/queries/entries.ts`

`fetchLabour` / `fetchMaterial` / `fetchMachinery` / `fetchExpense` (`:593-663`) are structurally identical apart from table, category column, and the spend sorter. Incident is a fifth, different shape.

**Preserve exactly** (these earn their keep and the audit says so):
- the date-window handling (`from`/`to`/both/neither),
- incident's `created_at::date` special case,
- spend-sort via `sortSpendRows`,
- `computeEntriesLimit`'s preview caps.

- [x] **Step 1: Read the current code end-to-end**
```bash
sed -n '563,677p' lib/db/queries/entries.ts
```
Write down, for each of the five fetchers: the category column, the workStage column (or absence), the sort columns, and the spend accessor.

- [x] **Step 2: Extend the descriptor with the list-query members**

Add to `EntryTypeServerDescriptor` and to each entry in `DESCRIPTORS`:

```ts
  categoryColumn: PgColumn | null;   // workType / materialType / equipmentType / category / incidentType
  workStageColumn: PgColumn | null;  // null for incident
  createdAtColumn: PgColumn;
```

Populate from the schema. Add a test to `server.test.ts` asserting each column's `.name` matches the expected snake_case column, e.g.:

```ts
it("maps each type to its category column", () => {
  expect(serverDescriptorFor("labour").categoryColumn?.name).toBe("work_type");
  expect(serverDescriptorFor("material").categoryColumn?.name).toBe("material_type");
  expect(serverDescriptorFor("machinery").categoryColumn?.name).toBe("equipment_type");
  expect(serverDescriptorFor("expense").categoryColumn?.name).toBe("category");
  expect(serverDescriptorFor("incident").categoryColumn?.name).toBe("incident_type");
});

it("gives incident a null workStageColumn", () => {
  expect(serverDescriptorFor("incident").workStageColumn).toBeNull();
  for (const t of ["labour", "material", "machinery", "expense"] as const) {
    expect(serverDescriptorFor(t).workStageColumn?.name, t).toBe("work_stage");
  }
});
```

Verify the real column names first with `grep -n "workStage\|workType\|materialType\|equipmentType\|incidentType" lib/db/schema.ts` — do not guess.

- [x] **Step 3: Write one generic fetcher**

```ts
// One fetcher parameterised by descriptor, replacing five near-identical
// bodies. The date predicate uses dateColumn when the type has one and
// dateExpr (created_at::date) when it does not — the incident asymmetry is
// now data, not a special case at the call site.
async function fetchEntriesOfType(
  type: EntryType,
  siteId: string,
  opts: { from?: string; to?: string; category?: string; workStage?: string; sort: EntriesSort; limit: number },
) {
  const d = serverDescriptorFor(type);
  const dateTarget = d.dateColumn ?? d.dateExpr;

  const datePredicate =
    opts.from && opts.to
      ? and(gte(dateTarget, opts.from), lte(dateTarget, opts.to))
      : opts.from
        ? gte(dateTarget, opts.from)
        : opts.to
          ? lte(dateTarget, opts.to)
          : undefined;

  const rows = await db
    .select()
    .from(d.table)
    .where(and(
      eq(sitesColumnFor(d), siteId),
      datePredicate,
      opts.category && d.categoryColumn ? eq(d.categoryColumn, opts.category) : undefined,
      opts.workStage && d.workStageColumn ? eq(d.workStageColumn, opts.workStage) : undefined,
    ))
    .orderBy(
      opts.sort === "oldest" ? asc(dateTarget) : desc(dateTarget),
      opts.sort === "oldest" ? asc(d.createdAtColumn) : desc(d.createdAtColumn),
    )
    .limit(opts.limit);

  return d.hasSpend ? sortSpendRows(rows, opts.sort, (row) => spendOfRow(type, row)) : rows;
}
```

`sitesColumnFor(d)` needs a `siteIdColumn` descriptor member — add it in Step 2 alongside the others (`labourEntries.siteId`, etc.). `spendOfRow` arrives in Task 5; until then, inline the existing per-type accessor and leave a `// TODO(Task 5)` marker — **and delete that marker in Task 5**, do not leave it.

- [x] **Step 4: Rewire `getEntriesBySite` to call it**

Replace the five `fetch*` closures with calls to `fetchEntriesOfType`. Keep the `Promise.all` fan-out for `type === "all"` — that is a deliberate performance property.

- [x] **Step 5: Run the full protecting suite**

```bash
npm run test -- --testTimeout=30000 lib/db/queries components/operations
npm run lint
```
Green required on `entries.test.ts`, `allOperationsView.test.ts`, `categoryView.test.ts`, `operationSummary.test.ts`, `sites.spend.test.ts`.

- [ ] **Step 6: Manual smoke — the date edge cases**

With the dev server, on a site with incidents logged today:
- All-operations view, no date filter → incidents appear.
- Date filter `from = to = today` → today's incidents still appear (this is the `created_at::date` cast; if they vanish, `dateExpr` is being compared as a timestamp).
- Inverted range (`from > to`) → the swap notice still fires (`swapDateRangeIfInverted` is untouched, but confirm).

- [x] **Step 7: Commit**
```bash
git add lib/db/queries/entries.ts lib/entryTypes/server.ts lib/entryTypes/server.test.ts
git commit -m "refactor(db): single descriptor-driven fetcher replaces five clone fetchers"
```

---

## Step 2 — Labour spend (F10)

### Task 5 — One TS labour-spend function, and a SQL↔TS parity test

**Files:**
- Create: `lib/services/labourSpend.ts`
- Create: `lib/services/labourSpend.test.ts`
- Modify: `components/operations/entryFormat.tsx`
- Modify: `lib/db/queries/entries.test.ts` (parity fixture)

**Correction to the audit — there are five encodings, not four, and one is already canonical.** Verified:

| # | Where | Kind | Status |
|---|---|---|---|
| 1 | `calculateLabourTotal` — `lib/db/queries/operationTotals.ts:46` | TS | **Canonical.** Tested at `entries.test.ts:18-33`. |
| 2 | `entrySpend` labour branch — `components/operations/entryFormat.tsx:103-110` | TS | Duplicate → delete, delegate to #1. |
| 3 | `labourSpendExpr` — `lib/db/queries/entries.ts:517-522` | SQL | Keep (aggregation must run in SQL); pin with a parity test. |
| 4 | `lib/db/queries/sites.ts:44` | SQL | Keep; pin with the same parity test. |
| 5 | `lib/db/queries/search.ts:101` | SQL | Keep; pin with the same parity test. |

The audit's fourth citation, `app/api/entries/labour/route.ts:37-42`, is the **write-side** derivation of the stored `salaryAmount` column (`peopleCount × wagePerHead` at insert time). It is a *different rule* — it decides what to store, not how to read. **Do not fold it into the spend helper.** Doing so would make creating an entry depend on the read-side precedence and change stored data.

**The precedence, stated once:** split (`masonSalaryAmount + helperSalaryAmount` when > 0) → stored `salaryAmount` (when > 0) → `peopleCount × wagePerHead`.

- [x] **Step 1: Confirm `calculateLabourTotal` really is the canonical rule**

```bash
sed -n '40,70p' lib/db/queries/operationTotals.ts
sed -n '10,40p' lib/db/queries/entries.test.ts
```
Compare, line by line, against `entryFormat.entrySpend`'s labour branch and against the three SQL expressions. Write down any difference you find. **If they already disagree, that is a live bug** — record it here and fix it deliberately in favour of `calculateLabourTotal`, noting the change in the commit message.

- [x] **Step 2: Write the failing test**

Create `lib/services/labourSpend.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { labourSpend } from "./labourSpend";

describe("labourSpend", () => {
  it("prefers the mason+helper split when either is positive", () => {
    expect(labourSpend({ masonSalaryAmount: "5000", helperSalaryAmount: "3000", salaryAmount: "999", peopleCount: 10, wagePerHead: "1000" })).toBe(8000);
    expect(labourSpend({ masonSalaryAmount: "5000", helperSalaryAmount: null, salaryAmount: "999", peopleCount: 10, wagePerHead: "1000" })).toBe(5000);
    expect(labourSpend({ masonSalaryAmount: null, helperSalaryAmount: "3000", salaryAmount: "999", peopleCount: 10, wagePerHead: "1000" })).toBe(3000);
  });

  it("falls back to the stored salaryAmount when the split is zero/absent", () => {
    expect(labourSpend({ salaryAmount: "12345", peopleCount: 10, wagePerHead: "1000" })).toBe(12345);
  });

  it("falls back to peopleCount × wagePerHead when nothing is stored", () => {
    expect(labourSpend({ peopleCount: 10, wagePerHead: "1000.00" })).toBe(10000);
  });

  it("returns 0 when there is nothing to compute from", () => {
    expect(labourSpend({})).toBe(0);
    expect(labourSpend({ peopleCount: 10, wagePerHead: null })).toBe(0);
    expect(labourSpend({ peopleCount: null, wagePerHead: "1000" })).toBe(0);
  });

  it("treats a zero split as absent, not as a spend of 0", () => {
    // A row with explicit zeros in both split columns must fall through to the
    // stored salary — otherwise editing a split entry to zeros would zero the
    // reported spend while the salary column still holds a value.
    expect(labourSpend({ masonSalaryAmount: "0", helperSalaryAmount: "0", salaryAmount: "7000" })).toBe(7000);
  });

  it("handles string decimals from drizzle without precision loss on money-sized values", () => {
    expect(labourSpend({ salaryAmount: "1234567.89" })).toBe(1234567.89);
  });
});
```

- [x] **Step 3: Run — expect FAIL.**

- [x] **Step 4: Implement as a re-export, not a re-implementation**

Create `lib/services/labourSpend.ts`:

```ts
import { calculateLabourTotal } from "@/lib/db/queries/operationTotals";

// The one TS home for "what did this labour row cost?".
// Precedence: mason+helper split → stored salaryAmount → peopleCount × wagePerHead.
// This is a thin, deliberate alias of calculateLabourTotal, which was already
// the canonical, tested implementation. It exists so callers outside the db
// layer (entryFormat, and later the client descriptor) have a non-db import
// path — importing spend logic from `lib/db/queries/*` is the seam leak F13
// exists to close.
//
// The three SQL copies (entries.ts labourSpendExpr, sites.ts, search.ts) must
// stay in agreement with this; lib/db/queries/entries.test.ts holds the
// fixture-parity test that proves it.
export const labourSpend = calculateLabourTotal;
export type { LabourSpendInput } from "@/lib/db/queries/operationTotals";
```

Check `operationTotals.ts`'s actual input type name and export it if it has one; if it takes a structural parameter, define the type locally instead.

If Step 1 found a genuine disagreement between `calculateLabourTotal` and any other copy, fix it **in `operationTotals.ts`** now, in this commit, with a test that pins the corrected behaviour.

- [x] **Step 5: Run — expect PASS.**

- [x] **Step 6: Delete the duplicate in `entryFormat.tsx`**

Replace the labour branch of `entrySpend` (`:103-110`):

```tsx
import { labourSpend } from "@/lib/services/labourSpend";

export function entrySpend(entry: Entry, type: EntryType) {
  if (type === "labour") return labourSpend(entry);
  if (type === "material") return Number(entry.cost ?? 0);
  if (type === "machinery") return Number(entry.totalCost ?? 0);
  if (type === "expense") return Number(entry.amount ?? 0);
  return 0;
}
```

- [x] **Step 7: Run `entryFormat.test.ts` — expect PASS unchanged.**

```bash
npm run test -- --testTimeout=30000 components/operations/entryFormat.test.ts
```

- [x] **Step 8: Add the SQL↔TS parity fixture test**

Add to `lib/db/queries/entries.test.ts` (or `sites.spend.test.ts`, whichever already has the DB fixture scaffolding — check both and reuse, do not build a third):

```ts
// SQL↔TS parity. Three SQL copies of the labour precedence exist
// (entries.ts labourSpendExpr, sites.ts, search.ts). A change to one that is
// not mirrored in labourSpend() makes list totals silently disagree with
// summary totals. This test inserts rows exercising all three precedence
// branches and asserts the SQL sum equals the TS sum.
describeDb("labour spend SQL/TS parity", () => {
  it("siteOperationSummary's labour spend equals sum(labourSpend(row))", async () => {
    // fixture rows, all on one site + one date:
    //   A: mason 5000 + helper 3000, salaryAmount 999, people 10 @ 1000
    //   B: no split, salaryAmount 12345, people 10 @ 1000
    //   C: no split, no salaryAmount, people 4 @ 600
    //   D: split columns explicitly 0, salaryAmount 7000
    //   E: everything null
    // → expect summary.labour.todaySpend === 8000 + 12345 + 2400 + 7000 + 0
    // → and === rows.reduce((s, r) => s + labourSpend(r), 0)
  });
});
```

Fill in the fixture using the file's existing insert helpers. Row **D** is the important one — it is exactly where a naive SQL `coalesce(...) > 0` check and a naive TS truthiness check diverge.

- [x] **Step 9: Run the DB test**
```bash
npm run test -- --testTimeout=30000 lib/db/queries/entries.test.ts lib/db/queries/sites.spend.test.ts
```
If it fails, **the SQL and TS genuinely disagree** — that is the bug this phase exists to surface. Fix the SQL to match `calculateLabourTotal`, in a separate commit, with the failing test as evidence.

- [x] **Step 10: Commit**
```bash
git add lib/services/labourSpend.ts lib/services/labourSpend.test.ts components/operations/entryFormat.tsx lib/db/queries/entries.test.ts
git commit -m "refactor(spend): one TS labour-spend function plus SQL/TS parity fixture test"
```

---

## Step 3 — Display chains (F7 display half)

### Task 6 — The client descriptor

**Files:**
- Create: `lib/entryTypes/client.ts`
- Create: `lib/entryTypes/client.test.ts`
- Modify: `components/operations/entryFormat.tsx`
- Modify: `components/logs/entryFieldRegistry.ts`

**Interfaces:**
- Produces:
  ```ts
  export type EntryTypeClientDescriptor = {
    type: EntryType;
    label: string;                        // "Labour" …
    idField: string;                      // "labourEntryId" …
    dateField: "date" | "createdAt";
    categoryField: string;                // "workType" | "materialType" | …
    categoryFallback: string;             // "Labour" | "Material" | … | "Misc"
    endpoint: string;                     // "/api/entries/labour" …
    formFields: EntryField[];
    spendOf: (entry: Record<string, unknown>) => number;
  };
  export function clientDescriptorFor(type: EntryType): EntryTypeClientDescriptor;
  ```

**What this replaces:** the seven `if (type === …)` chains in `entryFormat.tsx` — `entryId` (`:81-94`, a switch), `entryDate` (`:96-101`), `entrySpend` (`:103-120`), `gridCategoryKey` (`:185-191`), plus `typeLabel` (`:65-71`) and `entryEndpointFor` (`entryFieldRegistry.ts:157-166`).

**Do NOT move `renderEntrySummary` into the descriptor in this task.** It is 95 lines of per-type JSX (`:193-288`) with genuinely different markup per type — moving it buys nothing and risks visual regressions across five screens. Leave it where it is; if you want it in the descriptor later, that is its own task with visual verification. (This is a deliberate departure from the audit's sketch, which lists `renderSummary` as a descriptor member.)

- [x] **Step 1: Write the failing parity test**

Create `lib/entryTypes/client.test.ts`. Every case asserts the descriptor agrees with the function it will replace, so a mistake is caught before the old code is deleted:

```ts
import { describe, expect, it } from "vitest";

import { clientDescriptorFor } from "./client";
import { entryId, gridCategoryKey, typeLabel } from "@/components/operations/entryFormat";
import { entryEndpointFor, resolveEntryFields } from "@/components/logs/entryFieldRegistry";
import type { EntryType } from "@/lib/types/entry";

const ALL: EntryType[] = ["labour", "material", "machinery", "expense", "incident"];

const sample: Record<EntryType, Record<string, unknown>> = {
  labour: { labourEntryId: "L1", workType: "Masonry", date: "2026-08-06" },
  material: { materialEntryId: "M1", materialType: "Cement", date: "2026-08-06" },
  machinery: { machineryEntryId: "K1", equipmentType: "JCB", date: "2026-08-06" },
  expense: { expenseEntryId: "E1", category: "Fuel", date: "2026-08-06" },
  incident: { incidentReportId: "I1", incidentType: "Near miss", createdAt: "2026-08-06T09:00:00Z" },
};

describe("client entry-type descriptors", () => {
  it("labels match typeLabel exactly", () => {
    for (const t of ALL) expect(clientDescriptorFor(t).label, t).toBe(typeLabel[t]);
  });

  it("idField reads the same id entryId() returns", () => {
    for (const t of ALL) {
      const d = clientDescriptorFor(t);
      expect(sample[t][d.idField], t).toBe(entryId(sample[t], t));
    }
  });

  it("categoryField + fallback reproduce gridCategoryKey", () => {
    for (const t of ALL) {
      const d = clientDescriptorFor(t);
      expect(String(sample[t][d.categoryField] ?? d.categoryFallback), t)
        .toBe(gridCategoryKey(sample[t], t));
      // and the fallback path, with the field absent
      expect(d.categoryFallback, t).toBe(gridCategoryKey({}, t));
    }
  });

  it("endpoints match entryEndpointFor", () => {
    for (const t of ALL) expect(clientDescriptorFor(t).endpoint, t).toBe(entryEndpointFor(t));
  });

  it("formFields match the registry", () => {
    for (const t of ALL) {
      expect(clientDescriptorFor(t).formFields, t).toEqual(resolveEntryFields(t));
    }
  });

  it("incident reads its date from createdAt, the others from date", () => {
    expect(clientDescriptorFor("incident").dateField).toBe("createdAt");
    for (const t of ["labour", "material", "machinery", "expense"] as const) {
      expect(clientDescriptorFor(t).dateField, t).toBe("date");
    }
  });

  it("spendOf is 0 for incident and matches the per-type accessor otherwise", () => {
    expect(clientDescriptorFor("incident").spendOf({ anything: 1 })).toBe(0);
    expect(clientDescriptorFor("material").spendOf({ cost: "250.50" })).toBe(250.5);
    expect(clientDescriptorFor("machinery").spendOf({ totalCost: "1000" })).toBe(1000);
    expect(clientDescriptorFor("expense").spendOf({ amount: "42" })).toBe(42);
    expect(clientDescriptorFor("labour").spendOf({ peopleCount: 4, wagePerHead: "600" })).toBe(2400);
  });
});
```

- [x] **Step 2: Run — expect FAIL.**

- [x] **Step 3: Implement `lib/entryTypes/client.ts`**

```ts
import { REGISTRY_BY_TYPE, type EntryField } from "@/components/logs/entryFieldRegistry";
import { labourSpend } from "@/lib/services/labourSpend";
import type { EntryType } from "@/lib/types/entry";

// One descriptor per entry type, client half. No DB imports, no server-only
// modules — this is what UI code reads instead of re-deriving "what is a
// material entry" in seven separate if-chains.
//
// renderEntrySummary deliberately stays in entryFormat.tsx: it is 95 lines of
// genuinely different per-type JSX, and moving it buys locality we do not need
// while risking visual regressions on five screens.
export type EntryTypeClientDescriptor = {
  type: EntryType;
  label: string;
  idField: string;
  dateField: "date" | "createdAt";
  categoryField: string;
  categoryFallback: string;
  endpoint: string;
  formFields: EntryField[];
  spendOf: (entry: Record<string, unknown>) => number;
};

const DESCRIPTORS = {
  labour: {
    type: "labour", label: "Labour", idField: "labourEntryId", dateField: "date",
    categoryField: "workType", categoryFallback: "Labour",
    endpoint: "/api/entries/labour",
    formFields: REGISTRY_BY_TYPE.labour,
    spendOf: (e) => labourSpend(e),
  },
  material: {
    type: "material", label: "Material", idField: "materialEntryId", dateField: "date",
    categoryField: "materialType", categoryFallback: "Material",
    endpoint: "/api/entries/materials",
    formFields: REGISTRY_BY_TYPE.material,
    spendOf: (e) => Number(e.cost ?? 0),
  },
  machinery: {
    type: "machinery", label: "Machinery", idField: "machineryEntryId", dateField: "date",
    categoryField: "equipmentType", categoryFallback: "Machinery",
    endpoint: "/api/entries/machinery",
    formFields: REGISTRY_BY_TYPE.machinery,
    spendOf: (e) => Number(e.totalCost ?? 0),
  },
  expense: {
    type: "expense", label: "Expense", idField: "expenseEntryId", dateField: "date",
    categoryField: "category", categoryFallback: "Misc",
    endpoint: "/api/entries/expenses",
    formFields: REGISTRY_BY_TYPE.expense,
    spendOf: (e) => Number(e.amount ?? 0),
  },
  incident: {
    type: "incident", label: "Incident", idField: "incidentReportId",
    // Incidents have no `date` column; the app reads created_at.
    dateField: "createdAt",
    categoryField: "incidentType", categoryFallback: "Incident",
    endpoint: "/api/entries/incidents",
    formFields: REGISTRY_BY_TYPE.incident,
    spendOf: () => 0,
  },
} satisfies Record<EntryType, EntryTypeClientDescriptor>;

export function clientDescriptorFor(type: EntryType): EntryTypeClientDescriptor {
  return DESCRIPTORS[type];
}
```

This requires exporting the registry map by type. In `components/logs/entryFieldRegistry.ts`, change the private `const REGISTRY: Record<string, EntryField[]>` into an exported, type-safe map:

```ts
export const REGISTRY_BY_TYPE = {
  labour: [...],
  material: [...],
  machinery: [...],
  expense: [...],
  incident: [...],
} satisfies Record<EntryType, EntryField[]>;

// Kept for the alias/dynamic path: a category name that is not one of the five
// known types resolves to fallbackFields.
const REGISTRY: Record<string, EntryField[]> = REGISTRY_BY_TYPE;
```
`resolveEntryFields`, `resolveEntryKind`, `entryEndpointFor` and `entryFieldRegistry.test.ts` all keep working unchanged.

- [x] **Step 4: Run — expect PASS.**

- [x] **Step 5: Rewire `entryFormat.tsx` to the descriptor**

```tsx
import { clientDescriptorFor } from "@/lib/entryTypes/client";

export const typeLabel: Record<EntryType, string> = {
  labour: clientDescriptorFor("labour").label,
  material: clientDescriptorFor("material").label,
  machinery: clientDescriptorFor("machinery").label,
  expense: clientDescriptorFor("expense").label,
  incident: clientDescriptorFor("incident").label,
};

export function entryId(entry: Entry, type: EntryType) {
  return entry[clientDescriptorFor(type).idField];
}

export function entryDate(entry: Entry, type: EntryType) {
  const d = clientDescriptorFor(type);
  // Incidents carry a timestamp; every other type a plain date string. Slicing
  // to 10 chars is safe for both and is what this function has always done.
  return String(entry[d.dateField] ?? "").slice(0, 10);
}

export function entrySpend(entry: Entry, type: EntryType) {
  return clientDescriptorFor(type).spendOf(entry);
}

export function gridCategoryKey(entry: Entry, type: EntryType): string {
  const d = clientDescriptorFor(type);
  return String(entry[d.categoryField] ?? d.categoryFallback);
}
```

**Watch this one:** the old `entryDate` sliced only for incident and returned `String(entry.date ?? "")` unsliced for the rest. A `date` column comes back as `"2026-08-06"` (10 chars) so slicing is a no-op — but confirm against `entryFormat.test.ts` rather than assuming, and if any fixture has a longer date string, keep the branch.

`entryCategoryKey` (`:174-180`) is dead code — leave it alone here; [Phase 6](phase-6-dead-code-and-polish.md) deletes it.

- [x] **Step 6: Run the display suite**
```bash
npm run test -- --testTimeout=30000 components/operations components/logs
npm run lint
```

- [ ] **Step 7: Visual smoke**

All five screens must be pixel-identical: site detail, all-operations, each per-type operation page, a category detail page, and an entry list with a merged row (`_mergedEntryCount > 1`). Compare spend figures against the summary header on the same page — they must agree.

- [x] **Step 8: Commit**
```bash
git add lib/entryTypes/client.ts lib/entryTypes/client.test.ts components/operations/entryFormat.tsx components/logs/entryFieldRegistry.ts
git commit -m "refactor(operations): entryFormat reads the client entry-type descriptor"
```

---

## Step 4 — Validation & field metadata (F18)

### Task 7 — Shared numeric constraints

**Files:**
- Create: `lib/entryTypes/constraints.ts`
- Create: `lib/entryTypes/constraints.test.ts`
- Modify: `lib/validation/schemas.ts`
- Modify: `components/logs/entryFieldRegistry.ts`

**The problem, verified.** `entryFieldRegistry.ts` declares `wagePerHead min 0.01`, `peopleCount min 1 max 10000 step 1`, `hoursActive min 0.1 max 24 step 0.1`, etc. `lib/validation/schemas.ts` independently declares e.g. `positiveDecimalSchema(1000000)`. Two sources of truth for "what is valid". Given the F4 precedent, they will disagree.

**The approach, and why not the alternative.** Do **not** derive UI metadata from zod internals — the repo is on zod 4, whose internal shape differs from zod 3, and `_def` reading breaks on every minor upgrade. Instead: one constants module, **two consumers**. The zod schema builder reads it; the field registry reads it. Neither reads the other.

- [x] **Step 1: Inventory the current constraints on both sides**

```bash
grep -n "min\|max\|step" components/logs/entryFieldRegistry.ts
grep -n "positiveDecimalSchema\|\.min(\|\.max(\|MAX_" lib/validation/schemas.ts lib/validation/constants.ts
```
Build a table, per field: registry min/max/step vs schema min/max. **Record every disagreement you find in this doc** before changing anything — each one is a latent bug and each needs an explicit decision (usually: the stricter bound wins, and the schema is authoritative because it is enforced server-side).

- [x] **Step 2: Write the failing test**

Create `lib/entryTypes/constraints.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { ENTRY_FIELD_CONSTRAINTS } from "./constraints";
import { resolveEntryFields } from "@/components/logs/entryFieldRegistry";
import type { EntryType } from "@/lib/types/entry";

const ALL: EntryType[] = ["labour", "material", "machinery", "expense", "incident"];

describe("shared entry field constraints", () => {
  it("every numeric registry field has a constraints entry", () => {
    for (const type of ALL) {
      for (const field of resolveEntryFields(type)) {
        if (field.kind !== "number") continue;
        expect(ENTRY_FIELD_CONSTRAINTS[field.name], `${type}.${field.name}`).toBeDefined();
      }
    }
  });

  it("the registry's min/max/step come from the shared constraints", () => {
    for (const type of ALL) {
      for (const field of resolveEntryFields(type)) {
        if (field.kind !== "number") continue;
        const c = ENTRY_FIELD_CONSTRAINTS[field.name];
        expect(field.min, `${type}.${field.name}.min`).toBe(c.min);
        expect(field.max, `${type}.${field.name}.max`).toBe(c.max);
        expect(field.step, `${type}.${field.name}.step`).toBe(c.step);
      }
    }
  });
});
```

Plus, in `lib/validation/schemas.test.ts`, add cases asserting the schema rejects just below `min` and just above `max` for each numeric field, using `ENTRY_FIELD_CONSTRAINTS` as the source of the boundary values. That is what proves the two consumers actually agree.

- [x] **Step 3: Run — expect FAIL.**

- [x] **Step 4: Implement**

Create `lib/entryTypes/constraints.ts`:

```ts
// Single source of truth for numeric bounds on entry fields, consumed by BOTH
// the zod schemas (server enforcement) and the form field registry (client
// affordances: min/max/step attributes and the derived inputMode).
//
// Deliberately plain constants rather than derived-from-zod: reading bounds out
// of zod's internals is brittle across versions (this repo is on zod 4), and a
// UI that silently loses its `max` after a dependency bump is worse than a
// little duplication of intent. Two consumers, one source.
export type FieldConstraint = { min?: number; max?: number; step?: number };

export const ENTRY_FIELD_CONSTRAINTS = {
  // fill in from the Step 1 inventory — one entry per numeric field:
  // peopleCount: { min: 1, max: 10000, step: 1 },
  // wagePerHead: { min: 0.01, max: MAX_MONEY, step: 0.01 },
  // …
} satisfies Record<string, FieldConstraint>;
```

Populate it from the Step 1 inventory. Then:
- In `entryFieldRegistry.ts`, replace each literal `min`/`max`/`step` with a spread of the constraint: `{ name: "peopleCount", label: "People Count", kind: "number", required: true, ...ENTRY_FIELD_CONSTRAINTS.peopleCount }`.
- In `lib/validation/schemas.ts`, build the numeric schemas from the same constants.

**Order matters:** change the registry first, run `entryFieldRegistry.test.ts` (green = constants match what was there), *then* change the schemas, run `schemas.test.ts`. If you change both at once and something breaks, you cannot tell which side was wrong.

- [x] **Step 5: Run — expect PASS on both sides**
```bash
npm run test -- --testTimeout=30000 lib/entryTypes components/logs lib/validation
```

- [x] **Step 6: Commit**
```bash
git add lib/entryTypes/constraints.ts lib/entryTypes/constraints.test.ts components/logs/entryFieldRegistry.ts lib/validation/schemas.ts lib/validation/schemas.test.ts
git commit -m "refactor(validation): share numeric field constraints between zod schemas and the form registry"
```

---

### Task 8 — Collapse the `[id]` route's schema ternary and catalog-field list

**Files:**
- Modify: `lib/entryTypes/server.ts`
- Modify: `app/api/entries/[id]/route.ts`
- Modify: `lib/entryTypes/server.test.ts`

`app/api/entries/[id]/route.ts` currently carries a five-branch schema ternary (`:94-105`) and a seven-line `if (type === … && typeof updateData.X === "string")` catalog-field list (`:120-127`). Both are descriptor data.

- [x] **Step 1: Extend the server descriptor**

```ts
  zodCreate: ZodType;
  zodUpdate: ZodType;
  // Catalog-backed fields validated against a managed list on write, as
  // [listKey, fieldName] pairs. e.g. labour → [["Work Stage", "workStage"]].
  catalogFields: ReadonlyArray<readonly [string, string]>;
```

Populate from the current route. Verified current mapping:
- labour, material, machinery, expense → `[["Work Stage", "workStage"]]`
- expense also → `["Expense Category", "category"]`
- incident → `[["Incident Type", "incidentType"], ["Incident Severity", "severity"]]`

- [x] **Step 2: Add descriptor tests**

```ts
it("maps each type to its create/update schemas", () => {
  expect(serverDescriptorFor("labour").zodUpdate).toBe(updateLabourEntrySchema);
  // …all five, both schemas
});

it("lists the catalog-validated fields per type", () => {
  expect(serverDescriptorFor("labour").catalogFields).toEqual([["Work Stage", "workStage"]]);
  expect(serverDescriptorFor("expense").catalogFields).toEqual([
    ["Work Stage", "workStage"],
    ["Expense Category", "category"],
  ]);
  expect(serverDescriptorFor("incident").catalogFields).toEqual([
    ["Incident Type", "incidentType"],
    ["Incident Severity", "severity"],
  ]);
});
```

**Order is load-bearing** in the expense case: today Work Stage is checked before Expense Category, so a request with both invalid reports the Work Stage error. Keep that order or the error message changes.

- [x] **Step 3: Rewire the route**

```ts
const d = serverDescriptorFor(type);
const validation = validateBody(d.zodUpdate, parsed.data, requestId);
if (!validation.ok) return validation.response;

const updateData: Record<string, unknown> = { ...validation.data };
coerceDecimals(updateData, d.decimalFields);

for (const [listKey, field] of d.catalogFields) {
  // Only validate a catalog field that this request is actually changing —
  // a PATCH that omits workStage must not be rejected for it, and sending
  // null (un-tag) deliberately skips the check.
  if (typeof updateData[field] !== "string") continue;
  const check = await assertInCatalogList(listKey, updateData[field] as string);
  if (!check.ok) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, check.message, 400, undefined, requestId);
  }
  updateData[field] = check.value;
}
```

The `typeof !== "string"` guard reproduces the existing condition exactly, **including the un-tag path** (`workStage: null` skips the check) that `app/api/entries/[id]/route.test.ts` explicitly tests in three of its four cases. If those tests fail, this guard is wrong.

- [x] **Step 4: Run — expect PASS unchanged**
```bash
npm run test -- --testTimeout=30000 app/api/entries lib/entryTypes lib/validation
npm run lint
```

- [x] **Step 5: Commit**
```bash
git add lib/entryTypes/server.ts lib/entryTypes/server.test.ts app/api/entries/\[id\]/route.ts
git commit -m "refactor(api): entry PATCH route reads schemas and catalog fields from the descriptor"
```

---

### Task 9 — Point `decimalFieldsFor` at the descriptor

**Files:**
- Modify: `lib/services/entries.ts`

- [x] **Step 1: Replace the local record**

```ts
import { serverDescriptorFor } from "@/lib/entryTypes/server";

export function decimalFieldsFor(type: EntryType): readonly string[] {
  return serverDescriptorFor(type).decimalFields;
}
```
Delete the local `DECIMAL_FIELDS` constant. The parity test written in Task 2 becomes trivially true — **keep it anyway**; it now guards against someone re-introducing a local copy.

- [x] **Step 2: Run** `npm run test -- --testTimeout=30000 lib/services lib/entryTypes` and `npm run lint`.

- [x] **Step 3: Commit**
```bash
git add lib/services/entries.ts
git commit -m "refactor(services): decimalFieldsFor delegates to the entry-type descriptor"
```

---

## Phase regression checklist

### Automated

- [x] `npm run lint` → exit 0.
- [x] `npm run test -- --testTimeout=30000` → green, pass count ≥ baseline + new tests.
- [x] Every one of the eight protecting suites green, named individually:
  ```bash
  npm run test -- --testTimeout=30000 \
    lib/db/queries/entries.test.ts \
    components/operations/entryFormat.test.ts \
    components/logs/mapEntryToFormValues.test.ts \
    components/logs/entryFieldRegistry.test.ts \
    components/operations/typeStyles.test.ts \
    lib/validation/schemas.test.ts \
    components/operations/allOperationsView.test.ts \
    components/operations/categoryView.test.ts
  ```
- [x] DB-backed suites green: `lib/db/queries/operationSummary.test.ts`, `lib/db/queries/sites.spend.test.ts`, `lib/catalog/overviewQuery.test.ts`.
- [ ] `npm run test:e2e` green.
- [x] `tests/migration/no-src-imports.test.ts` green (new files under `lib/`).
- [x] Switch count dropped: `grep -c "switch (type)" lib/db/queries/entries.ts` → 0 or 1 (only `computeEntriesLimit`'s, if it has one).
- [x] `wc -l lib/db/queries/entries.ts` → materially below 710.

### Layering (the whole point of the split)

- [x] **No server module imports the client descriptor:**
  ```bash
  grep -rn "entryTypes/client" app/api lib/db lib/services
  ```
  → empty.
- [x] **The client descriptor imports nothing from `lib/db/`:**
  ```bash
  grep -n "lib/db" lib/entryTypes/client.ts
  ```
  → empty. (`labourSpend` re-exports from `lib/db/queries/operationTotals`; if `tsc` or the bundle analyzer shows that pulling the Drizzle client into the client bundle, move `calculateLabourTotal`'s body into `lib/services/labourSpend.ts` and have `operationTotals.ts` import *it*. Check this explicitly — it is the one plausible way this phase makes the bundle worse.)
- [x] **No React/JSX in the server descriptor:** `grep -n "react\|tsx\|lucide" lib/entryTypes/server.ts` → empty.

### Correctness

- [ ] **Spend agreement.** On a site with labour entries of all three precedence shapes: the site-detail summary total, the all-operations list total, and the per-type page total all show the same number. This is the F10 payoff and the thing most likely to break.
- [ ] **Incident date handling.** Incidents logged today appear under a `from=to=today` filter, and appear in the all-operations view.
- [ ] **Split-labour entries** render mason/helper lines and the correct total.
- [ ] **Merged rows** (`_mergedEntryCount > 1`) still suppress the `× wage` suffix.
- [ ] **Entry edit round-trip:** open an existing entry of each of the five types, save with no changes → 200, and the row is unchanged in the list (this exercises `getEntryById` → `mapEntryToFormValues` → PATCH → `updateEntryById`, i.e. every switch this phase collapsed).

### Security

- [x] **Mass-assignment control intact.** `updateEntryById` still strips all nine immutable keys. Verify by reading the final function, and by a targeted test:
  ```ts
  it("ignores siteId, createdBy and every id field in the update body", async () => {
    // PATCH a labour entry with { siteId: "other", createdBy: "someone",
    // materialEntryId: "x", peopleCount: 5 } → only peopleCount changes.
  });
  ```
  Add this test if `entries.test.ts` does not already have it — it is a security invariant with no current guard.
- [x] **Catalog-field validation unchanged.** The `[id]` route still validates every catalog-backed field it did before, in the same order (Task 8 tests).
- [x] **No new `sql.raw`.** `grep -rn "sql.raw" lib/entryTypes lib/db/queries/entries.ts` → only the pre-existing sites (none in `entries.ts`).
- [x] **`dateExpr` builds no string SQL.** It uses drizzle's tagged template with column references — confirm no interpolation of a user value: `grep -n "dateExpr" lib/entryTypes/server.ts`.
- [x] Auth guards on all changed routes unchanged: `git diff main -- app/api/entries/ | grep -n "require\|checkOwnership"` shows no removals.

### Performance

- [ ] **Query count unchanged.** `getEntriesBySite` still issues one query per type and still uses `Promise.all` for `"all"`. Verify by counting queries in the dev log for one all-operations page load, before and after.
- [x] **No new query.** The descriptor lookup is a plain object index — no I/O.
- [ ] **Client bundle did not grow.** If a bundle analyzer is available, compare before/after for the operations pages. At minimum, verify the layering greps above pass — those are what would cause growth.
- [x] **`sortSpendRows` still runs only for spend-bearing types** (`hasSpend`), not for incidents.

---

## Deliberate departures from the audit's sketch

Record these so a future reader does not "finish the job" wrongly:

1. **`renderSummary` is NOT a descriptor member.** 95 lines of per-type JSX with genuinely distinct markup; centralising it buys locality we do not need and risks five screens' visuals. Left in `entryFormat.tsx`.
2. **The descriptor is split server/client**, not one interface. The audit's guardrail A.1 anticipated this; it is a hard requirement, not a preference.
3. **The labour write-side rule stays in the labour POST route.** It decides what to *store*; the spend helper decides what to *read*. Merging them would change stored data.
4. **`immutableFields` is not descriptor-driven.** The current deny-list strips every type's id field on every update; a per-type list would be weaker.
5. **F18 uses shared constants, not zod introspection.** Zod 4; introspection is brittle.
6. **Incident does have form fields** (`REGISTRY.incident`), contrary to the audit's claim — so `formFields` is a required, not optional, member.


---

## Execution record (2026-08-07)

Baseline before Phase 3: `npm run lint` exit 0, **549 passed / 12 skipped (87 files)**.
After Phase 3: `npm run lint` exit 0, **605 passed / 12 skipped (91 files)**, `npm run build` succeeds.

Departures and findings worth carrying forward:

1. **`stripImmutableEntryFields` was extracted** (`lib/services/entries.ts`) instead of leaving the
   destructuring inline in `updateEntryById`. The deny-list is unchanged (all nine keys, not
   per-type) and is now pinned by four cases in `lib/services/entries.test.ts` — the security
   invariant the checklist said had no guard.
2. **The generic fetcher needed two members the plan's sketch did not have.** `categoryFilter`
   (incident matches `incident_type` OR `severity`; the sketch's `eq(categoryColumn, …)` would have
   silently narrowed it) and `spendOf`. Incident's single-column sort is derived from
   `dateColumn === null`, so no extra member.
3. **`dateExpr` is used for every type's date predicate**, not `dateColumn ?? dateExpr` — the union
   type broke drizzle's `gte`/`lte` overloads. `dateExpr` is the plain column reference for the four
   dated types, so the emitted SQL is unchanged.
4. **`getEntriesBySite` briefly lost its row types.** A non-generic fetcher degraded the return to
   `Record<string, unknown>[]` while `tsc` still passed. Made generic over `T extends EntryType`
   returning `RowByType[T][]`; verified by probing the inferred type before and after.
5. **`calculateLabourTotal` moved rather than being aliased.** Its body now lives in
   `lib/services/labourSpend.ts` and `operationTotals.ts` re-exports it, so nothing outside the DB
   layer imports spend logic from `lib/db/queries/*`.
6. **The five labour-spend encodings already agreed** — no live bug. Parity is now pinned by three
   DB fixture tests in `lib/db/queries/sites.spend.test.ts` covering all five precedence shapes
   (including row D, split columns explicitly 0) against `siteOperationSummary`, `siteTrackedSpend`
   and `searchRemarks`.
7. **F18 found three real disagreements**, resolved stricter-bound-wins (recorded in
   `lib/entryTypes/constraints.ts`): `quantity` and `amount` advertised `min: 0` while the schema
   requires positive (entering 0 passed the browser then 400'd); `wagePerHead`, `cost`, `count`,
   `totalCost`, `durationEstimate` had no UI `max` at all while the schema capped each. Both sides
   now read `ENTRY_FIELD_CONSTRAINTS`; a mutation check confirmed the guard fails when either side
   stops using it.

Not verified in this pass:

- **Manual/visual smoke** (date edge cases, five screens, spend agreement, edit round-trip). Needs a
  logged-in browser session.
- **`npm run test:e2e` is red for a pre-existing reason** unrelated to this phase:
  `e2e/route-migration.spec.ts` imports `betterAuthUsers` from `@/lib/db/schema`, which does not
  export it. `lib/db/schema.ts` is unmodified by Phase 3.
