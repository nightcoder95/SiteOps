# Global Work Stage Across All Operations

Date: 2026-07-16
Status: Approved design — pending implementation plan

## Problem

Work stage (Basement Level, Brick Level, Lintel Level, Roof Level, Compound Wall, Other)
is currently captured on **material entries only**. But all site work — labour, machinery,
expenses — happens at a specific stage too. Making stage global lets users capture it on
every operation and filter each operation's logs by stage (and enables a future cross-type
"all Basement Level logs" roll-up).

## Model (confirmed)

One canonical catalog list of stage values used by all four spend types. Each entry table
stores its **own** nullable `work_stage` varchar column pointing at the same list. Cross-type
filtering = the same value string matched across tables. No new shared/junction table — entries
already live in four separate per-type tables and hanging a shared table off them is a much
larger rework for no near-term gain.

- **Required?** Material keeps stage **required** (unchanged). Labour, machinery, expense get it
  **optional** — avoids breaking existing rows/forms and doesn't force users who don't track stage.
- **Filter scope:** stage filter applies on the category-detail page **and** the All Logs list,
  for all four spend types.

Spend types = `material | expense | labour | machinery`. `incident` and `all` untouched.

---

## 1. Catalog rename: "Material Work Stage" → "Work Stage"

The catalog category is going global, so rename its display name. Stored stage **values** are
unchanged (Basement Level … Other) — only the list's name changes, so existing material rows
stay valid.

**Migration** (hand-written SQL, matching the numbered `lib/db/migrations/*.sql` style):
```sql
UPDATE public.categories SET name = 'Work Stage' WHERE name = 'Material Work Stage';
```
Idempotent-safe (no-op if already renamed).

**Code references to swap `"Material Work Stage"` → `"Work Stage"`:**
- `lib/catalog/addCta.ts` (the `"Material Work Stage": "Work Stage"` noun map key)
- `lib/catalog/overview.ts` (`categoryName: "Material Work Stage"`)
- `lib/catalog/usageSources.ts` (`categoryName: "Material Work Stage"`)
- `components/logs/entryFieldRegistry.ts` (material field `catalogCategoryName`)
- `app/api/entries/materials/route.ts` (`assertInCatalogList("Material Work Stage", …)`)
- `app/api/entries/[id]/route.ts` (material `catalogFieldChecks` entry)
- `lib/validation/schemas.ts` (comment reference)
- `lib/db/schema.ts` (comment on `material_entries.work_stage`)

**Usage sources extension — and a real bug it exposes:** `lib/catalog/usageSources.ts` currently
maps "Work Stage" to `materialEntries.workStage` only, via a **singular** `usageSourceForCategory()`
(`.find()` — first match wins). Adding three more entries (`labourEntries.workStage`,
`machineryEntries.workStage`, `expenseEntries.workStage`) means one category name now maps to
**four** sources, which the singular API can't represent correctly. Three consumers assume 1:1 and
would silently misbehave once that assumption breaks:

- **Delete-guard** (`app/api/forms/subcategories/[id]/route.ts`) checks usage in only the first
  matching table — could allow deleting a stage still referenced by labour/machinery/expense rows,
  orphaning them.
- **Merge** (`app/api/admin/catalog/merge/route.ts`) rewrites the value in only the first matching
  table — merging two stage names leaves the old name stale in the other three tables.
- **`overviewQuery.ts`** (admin usage-count query) sums via `.set()` overwrite, not addition — a
  value shared across tables shows only one table's count, not the total.

This is fixed as part of Task 2 of the implementation plan: `usageSourceForCategory` (singular) is
replaced with `usageSourcesForCategory` (plural, always an array), and all three consumers are
updated to aggregate across every source for the category instead of assuming one.

---

## 2. Schema — add `work_stage` to three more tables

Add to `labour_entries`, `machinery_entries`, `expense_entries` (mirrors
`material_entries.workStage` exactly):

```ts
workStage: varchar("work_stage", { length: 100 }),   // nullable; managed catalog list "Work Stage"
```
Plus a matching index on each: `index("<table>_site_id_work_stage_idx").on(t.siteId, t.workStage)`.

No FK — membership is enforced at the API layer via `assertInCatalogList`, same as material.
Material's column/index/behaviour untouched.

**Migration** (same SQL file as §1):
```sql
ALTER TABLE public.labour_entries    ADD COLUMN IF NOT EXISTS work_stage varchar(100);
ALTER TABLE public.machinery_entries ADD COLUMN IF NOT EXISTS work_stage varchar(100);
ALTER TABLE public.expense_entries   ADD COLUMN IF NOT EXISTS work_stage varchar(100);
CREATE INDEX IF NOT EXISTS labour_entries_site_id_work_stage_idx    ON public.labour_entries    (site_id, work_stage);
CREATE INDEX IF NOT EXISTS machinery_entries_site_id_work_stage_idx ON public.machinery_entries (site_id, work_stage);
CREATE INDEX IF NOT EXISTS expense_entries_site_id_work_stage_idx   ON public.expense_entries   (site_id, work_stage);
```

---

## 3. Validation (`lib/validation/schemas.ts`)

**Create** schemas — `workStage: z.string().min(1).max(100).optional()` (shape-only; membership
checked at route):
- `labourCommonCreateShape`, `machineryEntrySchema` (base), `expenseEntrySchema` (base).

**Update** schemas — `workStage: z.string().min(1).max(100).nullable().optional()` so a client can
send `null` to **un-tag** (clear) a previously-set stage:
- `updateLabourEntrySchema`, `updateMachineryEntrySchema`.
- `updateExpenseEntrySchema` inherits from `expenseEntrySchema.partial()`, so make the expense base
  field `.nullable().optional()` (nullable is harmless on create — the route treats `null`/absent
  identically as "no stage").

Material stays **required** (`materialEntrySchema.workStage` unchanged, non-nullable) — material
can't be un-tagged.

---

## 4. API routes

**`POST /api/entries/{expenses,labour,machinery}/route.ts`** — read `workStage` from validated
body; if present, canonicalise via `assertInCatalogList("Work Stage", workStage)` (skip the check
when omitted, since optional) and store the canonical value, else `null`. Follow the material
route's `workStageCheck` pattern, but non-fatal-on-absent.

**`PATCH /api/entries/[id]/route.ts`** — add `catalogFieldChecks` pushes for labour/machinery/expense
mirroring the existing material one:
```ts
if (type === "labour"    && typeof updateData.workStage === "string") catalogFieldChecks.push(["Work Stage", "workStage"]);
if (type === "machinery" && typeof updateData.workStage === "string") catalogFieldChecks.push(["Work Stage", "workStage"]);
if (type === "expense"   && typeof updateData.workStage === "string") catalogFieldChecks.push(["Work Stage", "workStage"]);
```
(and swap material's `"Material Work Stage"` → `"Work Stage"`).

**Un-tag (clear) on edit:** a PATCH body carrying `workStage: null` skips the `typeof === "string"`
catalog check and flows through `updateEntryById`'s `.set({ ...safeData })`, setting the column NULL.
No extra route code beyond accepting `null` in the update schema (§3). Material's required stage is
non-nullable, so it's unaffected.

---

## 5. Query layer (`lib/db/queries/entries.ts`)

`EntriesFilters.workStage` is already typed `MaterialWorkStage = string` — no type change.
Add the same stage clause `fetchMaterial` already has into `fetchLabour`, `fetchMachinery`,
`fetchExpense`:
```ts
workStage ? eq(<table>.workStage, workStage) : undefined,
```
Add `workStage` to each row's returned shape where the query typing enumerates columns
(select-all already includes the new column post-migration; confirm the TS row types pick it up).

---

## 6. Forms (`components/logs/entryFieldRegistry.ts`)

Add a `workStage` field (optional, **clearable**) to `labour`, `machinery`, `expense`:
```ts
{ name: "workStage", label: "Work Stage", kind: "subcategory", required: false, clearable: true,
  catalogCategoryName: "Work Stage", noun: "Work Stage" }
```
Add `clearable?: boolean` to the `EntryField` type. Material's existing field: change
`catalogCategoryName` to `"Work Stage"`, keep `required: true` (no `clearable`).

`EntryForm.tsx` renders any registry `subcategory`+`catalogCategoryName` field generically. **One
targeted change** to `buildPayload`'s subcategory branch to support un-tagging on edit:
```ts
} else if (f.kind === "subcategory") {
  const sub = v as SubcategoryOption | null;
  if (sub) payload[f.name] = sub.name;
  else if (isEdit && f.clearable) payload[f.name] = null;   // send null → PATCH unsets it
}
```
This only emits `null` for fields explicitly flagged `clearable` (the three new optional stages),
so incident's optional `severity` and every required subcategory are **unaffected**. On create
(`!isEdit`) an unselected stage is still omitted. Placement: near the end of each form
(before remarks/amount) for consistency with material.

---

## 7. Filter UI + list rendering

- **`components/operations/entryFormat.tsx`**
  - `entryCategoryKey` — material-only work-stage suffix stays as-is (grid identity unaffected).
  - Rename exported const `materialStages` → `workStages` (see UI task for the full usage list).
  - Stage **badge** (currently a material-only branch, ~line 224): extend so labour/machinery/expense
    also render the stage badge **when `entry.workStage` is set**.
  - **Rename the exported const `materialStages` → `workStages`** (now global). Update all 6 usages
    (this file's export + 2 imports/2 map-calls in `OperationDetailPageClient.tsx`, 1 import/1
    map-call in `CategoryDetailPageClient.tsx`). Leave `materialWorkStages` in `lib/validation/schemas.ts`
    untouched — different const.
- **`OperationDetailPageClient.tsx`** and **`[category]/CategoryDetailPageClient.tsx`**
  - Stage filter dropdown is currently gated to material. **Ungate** → render for all four spend types.
  - Keep the round-trip `workStage` param wiring already present.
- **Stage-total summary cards** (OperationDetailPageClient ~lines 93–96, material-only): **keep
  material-only** for now — per-type spend semantics differ; a global version is future work.

---

## Acceptance

- All four spend forms show a Work Stage selector (optional on labour/machinery/expense, required on material).
- Catalog list renamed "Work Stage"; CatalogManager usage count spans all four entry tables.
- Stage filter works on both All Logs and the category-detail page for all four spend types.
- Stage badge renders on any entry that has a stage set.
- Existing material capture/behaviour unchanged; existing non-material rows unaffected (stage `null`).
- Membership still enforced server-side via `assertInCatalogList` (invalid stage → 400).

## Out of scope

- Backfilling stage onto historical labour/machinery/expense rows (they stay `null`).
- A cross-type unified "all logs at stage X" page. The shared list value makes it trivial later,
  but it's not built here.
- Global (cross-type) stage-total summary cards — stays material-only.
- Making stage required on non-material types.
- Any change to incident or the combined `all` view.

---
---

# Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** Make work stage global — captured on labour/machinery/expense (optional) as well as
material (required, unchanged), backed by one renamed catalog list "Work Stage", and filterable on
all four spend types in both the All Logs list and the category-detail page.

**Architecture:** One migration adds a nullable `work_stage` column + index to the three
non-material entry tables and renames the catalog category. Validation schemas gain an optional
`workStage`. The three POST routes canonicalise stage via `assertInCatalogList` when present; the
shared PATCH route adds catalog checks for the new fields. The query layer applies the existing
stage-filter clause to the three more `fetch*` builders. Forms get an optional Work Stage field via
the registry (no form-component change). The stage badge and stage filter are ungated from
material-only to all four spend types.

**Tech stack:** Next.js App Router, Drizzle ORM (Postgres/Supabase), drizzle-kit migrations,
Vitest (node env), Tailwind.

## Execution protocol (read first — for the implementing session)

You are implementing this plan in a fresh session. Follow it **exactly**; do not redesign.

1. **TDD is mandatory** for every task that touches pure/testable logic (schemas, catalog helpers,
   API routes, query builders). Order is strict **red → green → refactor**: write the failing test,
   run it, watch it fail for the *expected reason*, then write the minimum code to pass, then
   refactor. Never write implementation before its test.
2. **Non-unit-testable tasks** (DB migration DDL, form registry entries, `.tsx` UI) cannot be
   node-unit-tested under this repo's Vitest constraints (see Testing constraints). For those,
   "verification" = `npx tsc --noEmit` + the specified **read-only** manual QA against `npm run dev`.
   Each such task states its verification explicitly. Do not invent React render tests — the harness
   has no jsdom and they will not run.
3. **One task = one commit.** Run `npx tsc --noEmit` and the relevant `vitest --run` before every
   commit. Do not proceed to the next task while typecheck or tests are red.
4. **Do not run the migration against the database.** Implementation stops at code + generated
   migration file + passing unit tests. `npm run db:migrate` is the user's/deploy's step.
5. **Do not deviate** from the file map, field names, list key `"Work Stage"`, or the required/optional
   split. If reality contradicts the plan (e.g. a referenced line moved), stop and surface it rather
   than improvising a different design.
6. **Task dependencies:** do tasks in order. Task 1 (schema) must land before Tasks 3/6 typecheck
   cleanly; Tasks 1–2 (rename) before Tasks 4–5 reference `"Work Stage"`.

## Testing constraints (MANDATORY — read before writing any test)

- **The only database is production, used by live clients. Tests MUST NOT connect to, read from,
  or write to any real database.** Every route test mocks `@/lib/db/client` and the query
  functions, exactly like existing `app/api/**/route.test.ts` files. No test hits Postgres.
- Vitest runs in **`environment: 'node'`** with no jsdom/`@testing-library`. Do **not** write
  React render tests — they will not run. Testable logic lives in pure `.ts`; `.tsx` verified by
  typecheck + manual QA.
- Run: `npm test` (`vitest --run`). Typecheck: `npx tsc --noEmit`.
- Any manual DB read for verification is **read-only (SELECT only)** — never INSERT/UPDATE/DELETE.
- **Do not run the migration against prod as part of implementation.** Tasks build + typecheck +
  unit-test only; the migration is applied by the user/deploy pipeline (`npm run db:migrate`).

## File map

**Modify:**
- `lib/db/schema.ts` — add `workStage` col + index to labour/machinery/expense tables; update comment.
- `lib/validation/schemas.ts` — add optional `workStage` to labour/machinery/expense create + update schemas; update comment.
- `lib/db/queries/entries.ts` — add `workStage` to the three insert-fn arg types; add stage-filter clause to `fetchLabour`/`fetchMachinery`/`fetchExpense`.
- `app/api/entries/labour/route.ts`, `.../machinery/route.ts`, `.../expenses/route.ts` — canonicalise + store `workStage`.
- `app/api/entries/[id]/route.ts` — add catalog checks for labour/machinery/expense workStage; rename material's list key.
- `lib/catalog/addCta.ts`, `lib/catalog/overview.ts` — rename list.
- `lib/catalog/usageSources.ts` — rename list, add 3 usage sources, replace singular `usageSourceForCategory` with plural `usageSourcesForCategory`.
- `lib/catalog/overviewQuery.ts` — sum usage counts across sources instead of overwriting.
- `app/api/forms/subcategories/[id]/route.ts` — delete-guard sums usage across all sources for the category.
- `app/api/admin/catalog/merge/route.ts` — merge rewrites all sources for the category, in a transaction.
- `components/logs/entryFieldRegistry.ts` — add `clearable?` to `EntryField`; add optional Work Stage field to labour/machinery/expense; rename material's `catalogCategoryName`.
- `components/logs/mapEntryToFormValues.ts` — add `workStage` to labour/machinery/expense edit-prefill maps (else editing drops the stage).
- `components/logs/EntryForm.tsx` — `buildPayload` sends `workStage: null` when a `clearable` field is cleared in edit mode (un-tag).
- `components/operations/entryFormat.tsx` — render stage badge for all four spend types.
- `app/app/sites/[id]/operations/[type]/OperationDetailPageClient.tsx` — ungate stage filter.
- `app/app/sites/[id]/operations/[type]/[category]/CategoryDetailPageClient.tsx` — ungate stage filter.

**Create:**
- `lib/db/migrations/0025_global_work_stage.sql` (+ journal/snapshot via drizzle-kit) — columns, indexes, catalog rename.

**Test (existing suites updated / new):**
- `lib/catalog/usageSources.test.ts`, `lib/catalog/addCta.test.ts`, `lib/catalog/overview*.test.ts` — update the renamed-list expectations + new usage sources.
- `lib/validation/schemas.test.ts` — assert optional `workStage` accepted on the three create schemas.

---

### Task 1: Migration — columns, indexes, catalog rename

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `lib/db/migrations/0025_global_work_stage.sql` (+ journal + snapshot)

- [ ] **Step 1: Edit `schema.ts`** — add to `labourEntries`, `machineryEntries`, `expenseEntries`
  table bodies (mirror `materialEntries.workStage`):
```ts
  // Managed catalog list "Work Stage" (nullable — optional on non-material types).
  workStage: varchar("work_stage", { length: 100 }),
```
  and add to each table's index array:
```ts
  index("labour_entries_site_id_work_stage_idx").on(t.siteId, t.workStage),
  index("machinery_entries_site_id_work_stage_idx").on(t.siteId, t.workStage),
  index("expense_entries_site_id_work_stage_idx").on(t.siteId, t.workStage),
```
  Update the `material_entries.workStage` comment (line ~239) to say `"Work Stage"`.

- [ ] **Step 2: Generate the DDL migration** — run `npx drizzle-kit generate` to produce
  `0025_*.sql` with the three `ALTER TABLE … ADD COLUMN work_stage` + `CREATE INDEX` statements and
  the matching `_journal.json` entry + snapshot (keeps the journal consistent — do **not** hand-add
  the journal entry). Rename the generated file to `0025_global_work_stage.sql` **only if** drizzle
  tolerates it (it keys off the journal `tag` — keep tag and filename in sync; simplest is to accept
  the generated name and skip the rename).

- [ ] **Step 3: Append the catalog rename** — drizzle-kit does not emit data updates. Hand-add to
  the generated migration (after the DDL), matching the `--> statement-breakpoint` style of
  `0020_catalog_ssot_schema.sql`:
```sql
--> statement-breakpoint
UPDATE public.categories SET name = 'Work Stage' WHERE name = 'Material Work Stage';
```

- [ ] **Step 4: Verify SQL is idempotent-safe** — `ADD COLUMN` / `CREATE INDEX` from generate are
  not `IF NOT EXISTS`; that's fine for a forward-only migration. The `UPDATE` is a no-op if already
  renamed. Do **not** run it here.

- [ ] **Step 5: Typecheck** — `npx tsc --noEmit` → clean (schema change compiles; insert-fn arg
  types updated in Task 3, so this step may surface those — expected, fix arrives in Task 3. If
  isolating, run typecheck after Task 3).

- [ ] **Step 6: Commit**
```bash
git add lib/db/schema.ts lib/db/migrations/
git commit -m "feat(db): add work_stage to labour/machinery/expense + rename catalog list"
```

---

### Task 2: Catalog list rename + fix the multi-table usage-source assumption

**Background (why this task is bigger than a rename):** `usageSourceForCategory()` in
`lib/catalog/usageSources.ts` is a **singular** `.find()` — it assumes exactly one
`{table, column}` per category name. Once `"Work Stage"` maps to **four** tables
(material/labour/machinery/expense), that assumption breaks in three places:

1. **Delete-guard** (`app/api/forms/subcategories/[id]/route.ts`) — checks usage in only the
   *first* matching table (material). Deleting a stage still referenced by labour/machinery/expense
   rows would succeed, orphaning those rows (their stored name no longer exists as an active
   catalog item — breaks the managed-list invariant, and the value silently vanishes from filter
   dropdowns while still sitting in the DB).
2. **Merge** (`app/api/admin/catalog/merge/route.ts`) — rewrites the value in only the *first*
   matching table. Merging two stage names leaves the old name stale in the other three tables'
   rows — same orphaning problem, now self-inflicted by an admin action that looked like it succeeded.
3. **`overviewQuery.ts`** — iterates *all* sources (fine), but writes counts with
   `map.set(value, n)` (overwrite, not sum). Rows from different tables that share a value string
   (e.g. `"Basement Level"` in both material and labour) **clobber** each other — the admin usage
   count for a shared value is whichever table's branch is processed last, not the true total.

An uncommitted `usageSources.test.ts` in this repo already anticipates the shared-name shape (a
"counts Work Stage usage across all four entry types" case) but its last case
(`usageSourceForCategory(src.categoryName)).toBe(src)`, identity-checked in a loop) is
**unsatisfiable** once one category name has 4 distinct sources — that test must be rewritten as
part of this task, not left red.

**Fix:** replace the singular `usageSourceForCategory` with a plural `usageSourcesForCategory`
(always returns an array, `[]` if none) and update all three consumers to aggregate across it.

**Files:**
- Modify: `lib/catalog/addCta.ts`, `lib/catalog/overview.ts`, `lib/catalog/usageSources.ts`,
  `lib/catalog/overviewQuery.ts`, `app/api/forms/subcategories/[id]/route.ts`,
  `app/api/admin/catalog/merge/route.ts`
- Modify tests: `lib/catalog/addCta.test.ts`, `lib/catalog/overview.test.ts`,
  `lib/catalog/overviewQuery.test.ts`, `lib/catalog/usageSources.test.ts`
- Test (create if absent): `app/api/forms/subcategories/[id]/route.test.ts` cases,
  `app/api/admin/catalog/merge/route.test.ts` cases, for the multi-source path

- [ ] **Step 1 (red): `usageSources.test.ts`** — rewrite to match the plural API:
  - `usageSourcesForCategory("Materials")` → array of length 1, `[0].column === materialEntries.materialType`.
  - `usageSourcesForCategory("Work Stage")` → array of length 4, containing
    material/labour/machinery/expense with their respective `.workStage` columns.
  - `usageSourcesForCategory("Nonexistent")` → `[]`.
  - Drop the old identity-loop case (`usageSourceForCategory(src.categoryName)).toBe(src)`) — replace
    with: every `categoryName` present in `USAGE_SOURCES` has a non-empty result from
    `usageSourcesForCategory`, and each returned source is `===` one of the matching `USAGE_SOURCES`
    entries (membership, not single identity).
  Run `npx vitest --run lib/catalog/usageSources.test.ts` → FAIL.

- [ ] **Step 2 (green): rewrite `usageSources.ts`** —
```ts
export function usageSourcesForCategory(categoryName: string): UsageSource[] {
  return USAGE_SOURCES.filter((s) => s.categoryName === categoryName);
}
```
  Remove `usageSourceForCategory` (singular) — both call sites are being fixed in this task, so no
  dangling caller. Rename `"Material Work Stage"` entry's `categoryName` to `"Work Stage"`; add three
  entries: `{ categoryName: "Work Stage", table: labourEntries, column: labourEntries.workStage }`
  and the machinery/expense equivalents (import those tables). Run → PASS.

- [ ] **Step 3 (red): `overviewQuery.test.ts`** — add a case with two mocked rows sharing
  `category_name: "Work Stage"`, `value: "Basement Level"` from different tables (e.g. `n: 50` and
  `n: 10`) and assert the resulting map has `50 + 10 = 60` for that value (currently would assert/get
  `10`, whichever is last — confirms the overwrite bug). Run → FAIL.

- [ ] **Step 4 (green): fix `overviewQuery.ts`** — change the accumulation loop to sum instead of
  overwrite:
```ts
for (const r of rows) {
  const catMap = out.get(r.category_name);
  if (!catMap) continue;
  catMap.set(String(r.value), (catMap.get(String(r.value)) ?? 0) + Number(r.n));
}
```
  Run → PASS.

- [ ] **Step 5 (red): delete-guard route test** — in
  `app/api/forms/subcategories/[id]/route.test.ts`, mock `usageSourcesForCategory` (via mocking
  `@/lib/catalog/usageSources`) to return 4 sources for a "Work Stage" subcategory; mock the db so
  material's count is `0` but labour's count is `3`. Assert `DELETE` still returns `409 CONFLICT`
  (currently would 200/delete because only the first — material — source is checked, giving 0).
  Run → FAIL (or write against current code first to confirm red, per TDD).

- [ ] **Step 6 (green): fix delete-guard** — in `app/api/forms/subcategories/[id]/route.ts`:
```ts
const sources = catRows[0] ? usageSourcesForCategory(catRows[0].name) : [];
if (sources.length > 0) {
  const counts = await Promise.all(
    sources.map((source) =>
      db.select({ n: sql<number>`count(*)::int` }).from(source.table).where(eq(source.column, row.name))
    ),
  );
  const usage = counts.reduce((sum, c) => sum + Number(c[0]?.n ?? 0), 0);
  if (usage > 0) {
    return errorResponse(ERROR_CODES.CONFLICT, "This item is still in use — deactivate it instead of deleting", 409, undefined, requestId);
  }
}
```
  Update the import to `usageSourcesForCategory`. Run → PASS.

- [ ] **Step 7 (red): merge route test** — in `app/api/admin/catalog/merge/route.test.ts`, mock
  `usageSourcesForCategory` to return 4 sources for the merged category; assert the route issues an
  UPDATE against **all four** tables (spy on `db.transaction`/`tx.execute` call count), not just one.
  Run → FAIL.

- [ ] **Step 8 (green): fix merge route** — wrap the rewrite in a transaction, loop all sources so a
  partial failure doesn't leave some tables merged and others not:
```ts
const usageSources = catRows[0] ? usageSourcesForCategory(catRows[0].name) : [];
try {
  await db.transaction(async (tx) => {
    for (const usageSource of usageSources) {
      await tx.execute(
        sql`update ${usageSource.table} set ${usageSource.column} = ${target.name} where ${usageSource.column} = ${source.name}`,
      );
    }
    await tx.update(subcategories).set({ isActive: false }).where(eq(subcategories.subcategoryId, sourceId));
  });
  runNonCritical(requestId, "category_tree_cache_invalidation_failed", invalidateCategoryTreeCache(source.categoryId, requestId));
  return successResponse({ sourceId, targetId }, 200, requestId);
} catch (dbError) {
  const handled = handleDbError(dbError, requestId);
  if (handled) return handled;
  throw dbError;
}
```
  Update the import to `usageSourcesForCategory`. Run → PASS.

- [ ] **Step 9: Remaining renames** —
  - `addCta.ts`: map key `"Material Work Stage"` → `"Work Stage"` (value `"Work Stage"` unchanged).
  - `overview.ts`: `categoryName: "Material Work Stage"` → `"Work Stage"`.
  - Update `addCta.test.ts` / `overview.test.ts` expectations to match.

- [ ] **Step 10: Full catalog suite + typecheck** — `npx vitest --run lib/catalog app/api/forms/subcategories app/api/admin/catalog/merge && npx tsc --noEmit` → all green/clean.

- [ ] **Step 11: Commit**
```bash
git add lib/catalog/ "app/api/forms/subcategories/[id]/route.ts" app/api/admin/catalog/merge/route.ts "app/api/forms/subcategories/[id]/route.test.ts" app/api/admin/catalog/merge/route.test.ts
git commit -m "fix(catalog): support multiple tables per usage-source category (Work Stage spans 4 tables)"
```

---

### Task 3: Validation schemas + insert-fn arg types

**Files:**
- Modify: `lib/validation/schemas.ts`
- Modify: `lib/db/queries/entries.ts` (insert-fn arg types)
- Modify test: `lib/validation/schemas.test.ts`

- [ ] **Step 1: Update `schemas.test.ts` (red)** — add cases asserting:
  - `labourEntrySchema`, `machineryEntrySchema`, `expenseEntrySchema` (create) accept a body **with**
    `workStage: "Basement Level"` and **without** it (optional);
  - `updateLabourEntrySchema`, `updateMachineryEntrySchema`, `updateExpenseEntrySchema` accept
    `workStage: null` (un-tag) **and** a valid string **and** omission;
  - all three update schemas **reject** `workStage: ""` (empty string still invalid).
  Run → FAIL (unknown key stripped / null rejected depending on schema).

- [ ] **Step 2: Add `workStage` to schemas** —
  - Create: `workStage: z.string().min(1).max(100).optional()` on `labourCommonCreateShape`,
    `machineryEntrySchema` (base), `expenseEntrySchema` (base — use `.nullable().optional()` here so
    the derived `updateExpenseEntrySchema.partial()` accepts null).
  - Update: `workStage: z.string().min(1).max(100).nullable().optional()` on
    `updateLabourEntrySchema` and `updateMachineryEntrySchema`.
  Update the material comment `"Material Work Stage"` → `"Work Stage"`. Material's own `workStage`
  stays `z.string().min(1).max(100)` (required, non-nullable).

- [ ] **Step 3: Add `workStage` to insert-fn arg types** in `lib/db/queries/entries.ts`:
  - `insertLabourEntry` data type: `workStage?: string | null;`
  - `insertMachineryEntry` data type: `workStage?: string | null;`
  - `insertExpenseEntry` data type: `workStage?: string | null;`

- [ ] **Step 4: Run tests (green)** — `npx vitest --run lib/validation/schemas.test.ts` → PASS.
- [ ] **Step 5: Typecheck** — `npx tsc --noEmit` → clean.
- [ ] **Step 6: Commit**
```bash
git add lib/validation/schemas.ts lib/validation/schemas.test.ts lib/db/queries/entries.ts
git commit -m "feat(validation): optional workStage on labour/machinery/expense"
```

---

### Task 4: POST routes — canonicalise + store stage

**Files:**
- Modify: `app/api/entries/labour/route.ts`, `.../machinery/route.ts`, `.../expenses/route.ts`
- Test: add `workStage` cases to each route's `route.test.ts` (create the test file if absent,
  mirroring the existing route-test mock pattern)

For **each** of the three routes, in the POST handler after `validateBody`:

- [ ] **Step 1: Read + canonicalise (optional)** — before the insert:
```ts
let canonicalWorkStage: string | null = null;
if (typeof validation.data.workStage === "string" && validation.data.workStage.trim()) {
  const workStageCheck = await assertInCatalogList("Work Stage", validation.data.workStage);
  if (!workStageCheck.ok) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, workStageCheck.message, 400, undefined, requestId);
  }
  canonicalWorkStage = workStageCheck.value;
}
```
  Import `assertInCatalogList` (labour/machinery routes don't import it yet — add it; expenses
  already imports it).

- [ ] **Step 2: Pass to insert** — add `workStage: canonicalWorkStage,` to the
  `insertLabourEntry`/`insertMachineryEntry`/`insertExpenseEntry` call.

- [ ] **Step 3: Tests** — in each `route.test.ts`, add:
  - a POST **with** a valid `workStage` → 201, insert called with `workStage: "<canonical>"`, and
    `assertInCatalogList` mocked to `{ ok: true, value: "Basement Level" }`;
  - a POST **without** `workStage` → 201, insert called with `workStage: null`, and
    `assertInCatalogList` **not** called.
  (Mock `@/lib/validation/catalogList` per the existing pattern.) Run each → PASS.

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit` → clean.
- [ ] **Step 5: Commit**
```bash
git add app/api/entries/labour app/api/entries/machinery app/api/entries/expenses
git commit -m "feat(api): capture work stage on labour/machinery/expense entries"
```

---

### Task 5: PATCH route — catalog checks for new fields

**Files:**
- Modify: `app/api/entries/[id]/route.ts`

- [ ] **Step 1: Update `catalogFieldChecks`** — change the material line's list key and add three:
```ts
if (type === "material"  && typeof updateData.workStage === "string") catalogFieldChecks.push(["Work Stage", "workStage"]);
if (type === "labour"    && typeof updateData.workStage === "string") catalogFieldChecks.push(["Work Stage", "workStage"]);
if (type === "machinery" && typeof updateData.workStage === "string") catalogFieldChecks.push(["Work Stage", "workStage"]);
if (type === "expense"   && typeof updateData.workStage === "string") catalogFieldChecks.push(["Work Stage", "workStage"]);
```
  (`workStage` reaches `updateData` because it's now in the labour/machinery/expense update schemas
  from Task 3. A `null` value fails the `typeof === "string"` guard, so it **skips** the catalog
  check and passes through to `updateEntryById`'s `.set({ ...safeData })`, setting the column NULL —
  this is the un-tag path. No extra code needed.)

- [ ] **Step 2 (test, red→green): PATCH cases** — in `app/api/entries/[id]/route.test.ts` (create
  the file if absent, mirroring existing route-test mocks; mock `@/lib/db/queries/entries`'s
  `updateEntryById` + `getEntryById`/`findEntry` as used, `@/lib/validation/catalogList`, auth,
  ownership):
  - PATCH labour with `workStage: "Roof Level"` → `assertInCatalogList("Work Stage", …)` called,
    `updateEntryById` receives canonical `workStage: "Roof Level"`.
  - PATCH labour with `workStage: null` → `assertInCatalogList` **not** called for workStage,
    `updateEntryById` receives `workStage: null` (un-tag).
  - PATCH machinery/expense mirror the null case.
  Run → PASS.

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit` → clean.
- [ ] **Step 4: Commit**
```bash
git add "app/api/entries/[id]/route.ts"
git commit -m "feat(api): validate + allow clearing work stage on labour/machinery/expense edits"
```

---

### Task 6: Query layer — stage filter on three more fetchers

**Files:**
- Modify: `lib/db/queries/entries.ts` (`fetchLabour`, `fetchMachinery`, `fetchExpense`)
- Modify test: `lib/db/queries/entries.test.ts` (extend existing filter tests if present)

- [ ] **Step 1: Add the clause** — in each of `fetchLabour`, `fetchMachinery`, `fetchExpense`,
  inside the `and(...)` where-list, add:
```ts
workStage ? eq(<table>.workStage, workStage) : undefined,
```
  (`workStage` is already destructured from `filters` at the top of `getEntriesBySite`; the
  `EntriesFilters.workStage` type is already `string` — no type change.)

- [ ] **Step 2: Test** — if `entries.test.ts` covers `getEntriesBySite` with a mocked db, add a case
  asserting the `workStage` filter is applied for labour (and that omitting it applies no stage
  predicate). Run → PASS. If the query layer isn't unit-tested (real-db-only), skip and rely on
  typecheck + Task 8 manual check.

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit` → clean.
- [ ] **Step 4: Commit**
```bash
git add lib/db/queries/entries.ts lib/db/queries/entries.test.ts
git commit -m "feat(query): filter labour/machinery/expense by work stage"
```

---

### Task 7: Forms — optional Work Stage field, edit prefill, un-tag on clear

**Files:**
- Modify: `components/logs/entryFieldRegistry.ts` (add `clearable?` to `EntryField`; new fields)
- Modify: `components/logs/mapEntryToFormValues.ts` (edit prefill)
- Modify: `components/logs/EntryForm.tsx` (`buildPayload` clear-on-edit)
- Modify tests: `components/logs/entryFieldRegistry.test.ts`

**TDD note:** `entryFieldRegistry.ts` and `mapEntryToFormValues.ts` are node-testable → test-first.
`EntryForm.tsx`'s `buildPayload` is inside a `.tsx` component (not separately exported) and **cannot**
be node-unit-tested here → verified by typecheck + read-only manual QA (the null-clear branch is a
2-line, `clearable`-gated change). Do not add a React render test.

- [ ] **Step 1 (red): registry test** — extend `entryFieldRegistry.test.ts` to assert
  `resolveEntryFields("labour" | "machinery" | "expense")` includes a `workStage` field with
  `required: false`, `clearable: true`, `catalogCategoryName: "Work Stage"`; and
  `resolveEntryFields("material")` keeps `workStage` with `required: true`, no `clearable`,
  `catalogCategoryName: "Work Stage"`. Run → FAIL.

- [ ] **Step 2 (green): edit registry** —
  - Add `clearable?: boolean` to the `EntryField` type.
  - Material `workStage` field: `catalogCategoryName: "Work Stage"` (keep `required: true`, no `clearable`).
  - Add to `labour`, `machinery`, `expense` arrays (near the end, before remarks/amount):
```ts
{ name: "workStage", label: "Work Stage", kind: "subcategory", required: false, clearable: true,
  catalogCategoryName: "Work Stage", noun: "Work Stage" },
```
  Run → PASS. On **create**, an unselected optional subcategory is omitted from the payload
  (`buildPayload` only sets it when chosen), so `z.string().min(1).optional()` sees `undefined`, not
  `""` — no empty-string error.

- [ ] **Step 3 (red): edit-prefill test** — for `mapEntryToFormValues`, add/extend a test asserting
  a labour/machinery/expense entry with `workStage: "Roof Level"` yields form values including
  `workStage: "Roof Level"` (and `""` when the row's stage is null). Run → FAIL.

- [ ] **Step 4 (green): add prefill** — in `mapEntryToFormValues.ts`, add `workStage: entry.workStage ?? ""`
  to the `labour`, `machinery`, `expense` return objects (material already has it). Restores the
  stage as an `existing-workStage` SubcategoryOption (per `EntryForm` init ~lines 82–86). Run → PASS.

- [ ] **Step 5: `buildPayload` clear-on-edit** — in `EntryForm.tsx`, change the subcategory branch:
```ts
} else if (f.kind === "subcategory") {
  const sub = v as SubcategoryOption | null;
  if (sub) payload[f.name] = sub.name;
  else if (isEdit && f.clearable) payload[f.name] = null;   // un-tag → PATCH sets NULL
}
```
  Only `clearable` fields emit `null`; incident `severity` and every required subcategory are
  unaffected; create (`!isEdit`) still omits. Typecheck: `npx tsc --noEmit` → clean.

- [ ] **Step 6: Manual QA (edit path)** — un-tagging requires a PATCH (write). Verify the server
  contract via the Task 5 unit tests (already cover `workStage: null`). For end-to-end UI QA, use a
  **throwaway entry the user explicitly approves**, clear its stage, confirm via a **read-only**
  SELECT the column is NULL, then delete the throwaway. Otherwise rely on the unit tests + typecheck.

- [ ] **Step 7: Commit**
```bash
git add components/logs/entryFieldRegistry.ts components/logs/mapEntryToFormValues.ts components/logs/EntryForm.tsx components/logs/entryFieldRegistry.test.ts
git commit -m "feat(forms): optional Work Stage with edit prefill and un-tag on clear"
```

---

### Task 8: List rendering + filter UI (badge + ungate filter)

**Files:**
- Modify: `components/operations/entryFormat.tsx`
- Modify: `app/app/sites/[id]/operations/[type]/OperationDetailPageClient.tsx`
- Modify: `app/app/sites/[id]/operations/[type]/[category]/CategoryDetailPageClient.tsx`

- [ ] **Step 1: Rename the const** — in `entryFormat.tsx` rename export `materialStages` → `workStages`.
  Update all usages: the 2 imports + 2 `.map()` calls in `OperationDetailPageClient.tsx` (lines ~17,
  93, 235) and the 1 import + 1 `.map()` in `CategoryDetailPageClient.tsx` (lines ~16, 170). Leave
  `materialWorkStages` in `lib/validation/schemas.ts` alone. Typecheck after: `npx tsc --noEmit` → clean.

- [ ] **Step 2: Stage badge for all spend types** — in `entryFormat.tsx`, the summary render that
  currently shows `entry.workStage` only for `type === "material"` (~line 224): change the condition
  to render the stage badge for any spend type **when `entry.workStage` is set** (e.g.
  `entry.workStage ? <badge>{entry.workStage}</badge> : null`, dropping the material-only gate).
  Leave `entryCategoryKey`'s material-only `|workStage` suffix as-is (grid identity unaffected).

- [ ] **Step 3: Ungate the stage filter** — in both `OperationDetailPageClient.tsx` and
  `CategoryDetailPageClient.tsx`, the Stage `<select>` is currently rendered only for material.
  Render it for all four spend types (`material | expense | labour | machinery`). Keep the existing
  `filters.workStage` state + `?workStage=` round-trip wiring. Options come from `workStages`
  (the renamed const). Keep the **stage-total summary cards** in `OperationDetailPageClient`
  (~lines 93–96) **material-only** — do not ungate those.

- [ ] **Step 4: Manual check (read-only DB)** — `npm run dev`; on a site with existing entries:
  - Open labour/machinery/expense operation → Stage filter dropdown now shows.
  - Any entry that has a stage set shows the stage badge.
  - Filtering by a stage narrows the list; clearing restores it.
  - Material view unchanged.
  Do **not** create real prod entries; if a create is needed for QA, use a throwaway the user
  approves and deletes.

- [ ] **Step 5: Typecheck + full suite** — `npx tsc --noEmit && npm test` → clean/green.
- [ ] **Step 6: Commit**
```bash
git add components/operations/entryFormat.tsx "app/app/sites/[id]/operations/[type]/OperationDetailPageClient.tsx" "app/app/sites/[id]/operations/[type]/[category]/CategoryDetailPageClient.tsx"
git commit -m "feat(ui): show work-stage badge and stage filter on all spend types"
```

---

## Plan self-review

- **Spec coverage:** §1 rename → Tasks 1–2, 4–5, 7. §2 schema → Task 1. §3 validation → Task 3.
  §4 routes → Tasks 4–5. §5 query → Task 6. §6 forms → Task 7. §7 badge + filter → Task 8.
- **Placeholders:** none — all edits shown or precisely located.
- **DB safety:** every route/query test mocks `@/lib/db/client`; migration is not run during
  implementation; manual checks are read-only.
- **Ordering:** schema/migration first so column exists for insert-fn types (Task 3) and queries
  (Task 6); catalog rename (Tasks 1–2) before routes reference `"Work Stage"` (Tasks 4–5).
- **Correctness gap caught and folded in (not deferred):** the singular `usageSourceForCategory`
  API breaks once one catalog category maps to 4 tables — Task 2 replaces it with a plural,
  aggregating API and fixes the delete-guard, merge, and usage-count consumers, all test-first.
  Without this fix, shipping the rest of the plan alone would have created a live data-integrity
  hole (orphanable stage rows via delete or merge) the day the fourth usage source was added.

## Edge cases, error handling, security, performance

### Input / validation edge cases
- **Unselected optional stage:** form omits the key entirely (`buildPayload` only emits a chosen
  subcategory) → schema sees `undefined` → stored `null`. No `""` reaches the schema. *(Task 7 Step 2.)*
- **Empty/whitespace `workStage` from a non-form client:** `z.string().min(1)` rejects `""`; the
  route also guards `.trim()` before `assertInCatalogList`. Decision: an explicitly-sent blank stage
  is a **400**, not silently treated as absent. To omit the field, clients must not send the key.
- **Invalid / unknown stage value:** `assertInCatalogList("Work Stage", …)` returns `{ ok:false }`
  → `400 VALIDATION_ERROR` with the message. Same contract material already has.
- **Case / whitespace variants** (e.g. `"basement level"`): `assertInCatalogList` normalises
  (`norm()` — trim, lowercase, collapse spaces) and stores the **canonical** casing, so filtering
  stays consistent. *(Reused, not re-implemented.)*
- **Stage value deactivated in catalog** after rows exist: existing rows keep their stored string
  (still filterable); new writes to a deactivated stage are rejected (active-only membership). Same
  as material today — no special handling.
- **Clearing a stage on edit (un-tag):** supported. A `clearable`-flagged field cleared in edit mode
  sends `workStage: null`; the update schema accepts null, the PATCH catalog check skips non-strings,
  and `updateEntryById`'s `.set()` writes NULL. Create still omits an unselected stage. Incident
  `severity` and required subcategories are not `clearable`, so their behaviour is unchanged.

### Error handling
- Routes reuse the existing `errorResponse(ERROR_CODES.VALIDATION_ERROR, …, 400, …, requestId)` and
  `handleDbError` paths — no new error surface. The stage check runs **before** the DB write, so a
  bad stage never reaches Postgres.
- PATCH validation: `workStage` is checked in the shared `catalogFieldChecks` loop, which already
  returns 400 and normalises the value. No partial write occurs on a failed check (checks run before
  the `db.update`).

### Security
- **Injection:** `workStage` flows only into parameterized Drizzle `eq()` predicates and `.values()`
  inserts — no string interpolation into SQL. A hostile value simply fails membership → 400 or, in a
  filter, matches nothing.
- **XSS:** stage is rendered as React text (badge + option label) — auto-escaped. No `dangerouslySetInnerHTML`.
- **AuthZ unchanged:** all four routes keep their existing `requireSiteAccess` + `checkOwnership`
  guards; adding a field does not alter who can write. No new endpoint, no new data exposure — the
  stage filter runs over already-authorised rows.
- **Mass-assignment:** update goes through the per-type Zod schema (`.partial()` for expense/incident),
  so only whitelisted fields — now including `workStage` — reach `updateData`. No arbitrary column write.

### Performance
- **New indexes** `(site_id, work_stage)` on the three tables support the filtered fetch (which always
  includes `site_id`). Three extra btree indexes → marginal write cost; entry writes are low-volume
  (manual site logging), so acceptable.
- **Query cost unchanged in shape:** the stage clause is one extra `AND` on queries already capped at
  `limit ≤ 200`; no new round-trip, no N+1. Category grid still derives from already-fetched entries.
- **Migration:** `ADD COLUMN` of a nullable varchar is a metadata-only change in Postgres (no table
  rewrite). `CREATE INDEX` on the three entry tables locks writes briefly; volumes are small. Run
  during a low-traffic window if the tables are large. (Consider `CREATE INDEX CONCURRENTLY` only if
  the tables are big enough to matter — note for the operator, not required by the plan.)

### Backward compatibility
- Column nullable, optional in schemas, filter guarded by truthiness → existing
  labour/machinery/expense rows (stage `null`) and older clients omitting the field are unaffected.
  Material's required-stage behaviour is unchanged. Incident and the combined `all` view untouched.

### Deploy ordering (operator note — not an implementation step)
- **Migration before code:** run `npm run db:migrate` **before/with** deploying this code so `SELECT *`
  fetchers and inserts referencing `work_stage` succeed. New code against the old schema (missing
  column) would error on read/insert.
- **Catalog rename atomicity:** the `UPDATE categories … 'Work Stage'` and the code-side string swap
  must ship **together** — a renamed DB row with old code strings (or vice-versa) breaks
  `assertInCatalogList` membership lookups. Both live in this single change set, so a single deploy
  is atomic from the app's perspective; just don't cherry-pick.

## Plan self-review (edge/TDD)
- **TDD coverage:** Tasks 2,3,4,5,6,7 are test-first (catalog helpers, schemas, routes, query,
  registry, prefill). Tasks 1 (migration DDL) and 8 (`.tsx` UI) are typecheck + read-only manual QA
  by necessity (no node-testable surface) — stated explicitly per the Execution protocol.
- **Every spec requirement maps to a task; every edge case above maps to a specific step or an
  explicit out-of-scope note.**
- **No placeholders, no TODOs, no ambiguous field names.** List key is `"Work Stage"` everywhere.
