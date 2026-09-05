# Work Stage Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-site page that totals spend by work stage with drill-down, and make Work Stage mandatory on new labour/machinery/expense entries so the untagged gap stops growing.

**Architecture:** Part 1 adds one SSR route (`/app/sites/[id]/stages`) backed by a new query module doing four `GROUP BY work_stage` aggregates, stitched onto the ordered catalog list by a pure function. Part 2 flips three registry flags and three Zod schemas, with a pure predicate governing a legacy-edit exemption so pre-2026-07-25 entries stay editable.

**Tech Stack:** Next.js App Router (SSR), Drizzle ORM + Postgres (Supabase), Zod, Vitest, React.

**Spec:** `docs/superpowers/specs/2026-09-05-work-stage-summary-design.md`

## Global Constraints

- **No database migration.** `work_stage` columns stay nullable. 253 existing rows are NULL (labour 127/144, expense 120/127, machinery 6/8); `SET NOT NULL` would fail. Enforcement is form + API only.
- **No production data writes.** Do not backfill, renumber `sort_order`, or modify any existing row.
- **One labour-cost formula.** The precedence rule (mason+helper split → stored `salary_amount` → `people_count × wage_per_head`) has one TS home (`lib/services/labourSpend.ts`) and one SQL home (Task 1). Never write a fourth copy.
- **Every site-scoped query filters by `siteId`.** No cross-site leakage.
- **Auth guard on the new page is the existing chain**, identical to `app/app/sites/[id]/operations/[type]/page.tsx`: `safeGetSessionFromHeaders` → redirect → `getSiteById` → 404 on missing/archived → `checkOwnership` → 404.
- **Work Stage field launch date is `2026-07-25`** (migration `0025_global_work_stage.sql`).
- Commands: `npm test` (vitest), `npm run lint` (tsc). DB integration tests need `--testTimeout=30000` — one `describeDb` test flakes at the 5000ms default under parallel load.

---

### Task 1: Extract the labour-spend SQL expression

Prerequisite refactor. `labourSpendExpr` is currently a function-local `const` at `lib/db/queries/entries.ts:554`, so Task 6 cannot reuse it. Lifting it out is a pure move — no behaviour change.

**Files:**
- Create: `lib/db/queries/labourSpendSql.ts`
- Modify: `lib/db/queries/entries.ts:554-559` (delete the local const, import instead)
- Test: `lib/db/queries/entries.test.ts` (existing fixture-parity test must stay green)

**Interfaces:**
- Consumes: nothing.
- Produces: `labourSpendSumExpr: SQL` — a Drizzle `sql` fragment computing `sum(...)` of per-row labour cost. Usable inside any `select` over `labour_entries`.

- [ ] **Step 1: Run the existing parity test to establish a green baseline**

Run: `npm test -- lib/db/queries/entries.test.ts --testTimeout=30000`
Expected: PASS. If it fails before you change anything, stop and report — you cannot prove a no-op refactor against a red baseline.

- [ ] **Step 2: Create the shared expression module**

```typescript
// lib/db/queries/labourSpendSql.ts
import { sql } from "drizzle-orm";

// The one SQL home for "what did this labour row cost?". Mirrors
// lib/services/labourSpend.ts exactly — precedence is mason+helper split →
// stored salary_amount → people_count × wage_per_head.
//
// mason/helper amounts are PER-PERSON wages, so each role costs count × wage.
// The multiplication must appear in the WHEN guard as well as the THEN, or a
// wage with no head count takes this branch and reports the bare wage.
//
// lib/db/queries/entries.test.ts holds the fixture-parity test proving this
// agrees with the TS implementation. Do not inline a copy of this anywhere.
export const labourSpendSumExpr = sql`sum(case
        when coalesce(mason_count,0)*coalesce(mason_salary_amount,0)+coalesce(helper_count,0)*coalesce(helper_salary_amount,0)>0
          then coalesce(mason_count,0)*coalesce(mason_salary_amount,0)+coalesce(helper_count,0)*coalesce(helper_salary_amount,0)
        when coalesce(salary_amount,0)>0 then salary_amount
        else coalesce(people_count,0)*coalesce(wage_per_head,0)
      end)`;
```

- [ ] **Step 3: Replace the local const in entries.ts**

Delete lines 554-559 (the `const labourSpendExpr = sql\`sum(case ... end)\`;` block) and add to the import block at the top of the file:

```typescript
import { labourSpendSumExpr } from "@/lib/db/queries/labourSpendSql";
```

Then rename the three in-query references from `${labourSpendExpr}` to `${labourSpendSumExpr}` (entries.ts:563, 565, and any further occurrences — verify with `grep -n labourSpendExpr lib/db/queries/entries.ts`, which must return nothing when you are done).

- [ ] **Step 4: Verify no behaviour changed**

Run: `npm test -- lib/db/queries/entries.test.ts --testTimeout=30000`
Expected: PASS, same test count as Step 1.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries/labourSpendSql.ts lib/db/queries/entries.ts
git commit -m "refactor: extract labourSpendSumExpr to a shared module"
```

---

### Task 2: The work-stage requirement predicate

The rule that decides whether Work Stage is mandatory for a given form render. Pure, no React, no DB — this is where the legacy-edit exemption lives and where the edge cases are proven.

**Files:**
- Create: `lib/entryTypes/workStageRequirement.ts`
- Test: `lib/entryTypes/workStageRequirement.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `WORK_STAGE_LAUNCH_DATE: "2026-07-25"`
  - `isWorkStageRequired(input: { isEdit: boolean; existingWorkStage?: string | null; entryCreatedAt?: string | Date | null }): boolean`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/entryTypes/workStageRequirement.test.ts
import { describe, expect, it } from "vitest";

import { isWorkStageRequired } from "./workStageRequirement";

describe("isWorkStageRequired", () => {
  it("requires a stage on create", () => {
    expect(isWorkStageRequired({ isEdit: false })).toBe(true);
  });

  it("requires a stage on create even if a stale createdAt is passed", () => {
    // Create has no entry yet; createdAt must be ignored, not used to exempt.
    expect(
      isWorkStageRequired({ isEdit: false, entryCreatedAt: "2026-01-01T00:00:00Z" }),
    ).toBe(true);
  });

  it("exempts an untagged entry created before the field existed", () => {
    expect(
      isWorkStageRequired({
        isEdit: true,
        existingWorkStage: null,
        entryCreatedAt: "2026-07-24T23:59:59Z",
      }),
    ).toBe(false);
  });

  it("requires a stage for an untagged entry created after the field existed", () => {
    expect(
      isWorkStageRequired({
        isEdit: true,
        existingWorkStage: null,
        entryCreatedAt: "2026-07-25T00:00:00Z",
      }),
    ).toBe(true);
  });

  it("requires a stage for an already-tagged legacy entry, so it cannot be un-tagged", () => {
    expect(
      isWorkStageRequired({
        isEdit: true,
        existingWorkStage: "Basement Level",
        entryCreatedAt: "2026-01-01T00:00:00Z",
      }),
    ).toBe(true);
  });

  it("treats an empty-string stage as untagged", () => {
    expect(
      isWorkStageRequired({
        isEdit: true,
        existingWorkStage: "   ",
        entryCreatedAt: "2026-01-01T00:00:00Z",
      }),
    ).toBe(false);
  });

  it("requires a stage when createdAt is missing or unparseable", () => {
    // Fail strict: createdAt is NOT NULL in the schema, so absence means a
    // caller wiring bug. Silently exempting would open the hole this closes.
    expect(isWorkStageRequired({ isEdit: true, existingWorkStage: null })).toBe(true);
    expect(
      isWorkStageRequired({ isEdit: true, existingWorkStage: null, entryCreatedAt: "not-a-date" }),
    ).toBe(true);
  });

  it("accepts a Date as well as an ISO string", () => {
    expect(
      isWorkStageRequired({
        isEdit: true,
        existingWorkStage: null,
        entryCreatedAt: new Date("2026-07-24T00:00:00Z"),
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/entryTypes/workStageRequirement.test.ts`
Expected: FAIL — "Failed to resolve import ./workStageRequirement".

- [ ] **Step 3: Write the implementation**

```typescript
// lib/entryTypes/workStageRequirement.ts

// Migration 0025_global_work_stage.sql added work_stage to labour/machinery/
// expense on this date. Entries created before it could not carry a stage, so
// forcing one at edit time would make supervisors invent a building phase from
// memory — fabricated data, or an abandoned correction. Either is worse than
// the gap.
export const WORK_STAGE_LAUNCH_DATE = "2026-07-25";

const LAUNCH_MS = Date.parse(`${WORK_STAGE_LAUNCH_DATE}T00:00:00Z`);

export type WorkStageRequirementInput = {
  isEdit: boolean;
  existingWorkStage?: string | null;
  entryCreatedAt?: string | Date | null;
};

export function isWorkStageRequired(input: WorkStageRequirementInput): boolean {
  // New entries always carry a stage. This is the rule that stops the gap growing.
  if (!input.isEdit) return true;

  // An entry that already has a stage can never be un-tagged.
  if (typeof input.existingWorkStage === "string" && input.existingWorkStage.trim()) return true;

  // Untagged on edit: exempt only if it predates the field. createdAt is NOT
  // NULL in the schema, so a missing or unparseable value means a wiring bug —
  // fail strict rather than open a silent bypass.
  const raw = input.entryCreatedAt;
  if (raw == null) return true;
  const ms = raw instanceof Date ? raw.getTime() : Date.parse(raw);
  if (!Number.isFinite(ms)) return true;

  return ms >= LAUNCH_MS;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/entryTypes/workStageRequirement.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/entryTypes/workStageRequirement.ts lib/entryTypes/workStageRequirement.test.ts
git commit -m "feat: add work-stage requirement predicate with legacy-edit exemption"
```

---

### Task 3: Make the form require Work Stage

Flips the registry flags and wires Task 2's predicate into `EntryForm` so the requirement is computed per-render rather than read straight off the static registry.

**Files:**
- Modify: `components/logs/entryFieldRegistry.ts` (labour ~line 61, machinery ~line 94, expense ~line 116)
- Modify: `components/logs/EntryForm.tsx:80` (resolve fields), and the `Props` type at line 30
- Modify: `app/app/logs/[entryId]/page.tsx:78` (pass the entry's `createdAt`)
- Test: `components/logs/EntryForm.validate.test.ts`
- Test: `components/logs/entryFieldRegistry.test.ts`

**Interfaces:**
- Consumes: `isWorkStageRequired` from Task 2.
- Produces: `applyWorkStageRequirement(fields: EntryField[], input: WorkStageRequirementInput): EntryField[]` exported from `components/logs/entryFieldRegistry.ts`.

- [ ] **Step 1: Write the failing tests**

Append to `components/logs/entryFieldRegistry.test.ts`:

```typescript
import { applyWorkStageRequirement, resolveEntryFields } from "./entryFieldRegistry";

describe("work stage requirement", () => {
  it("marks Work Stage required on labour, machinery and expense", () => {
    for (const category of ["labour", "machinery", "expenses"]) {
      const field = resolveEntryFields(category).find((f) => f.name === "workStage");
      expect(field, `${category} has no workStage field`).toBeDefined();
      expect(field!.required, `${category} workStage should be required`).toBe(true);
    }
  });

  it("no longer marks Work Stage clearable, so an existing tag cannot be erased", () => {
    for (const category of ["labour", "machinery", "expenses"]) {
      const field = resolveEntryFields(category).find((f) => f.name === "workStage");
      expect(field!.clearable).toBeUndefined();
    }
  });

  it("relaxes the requirement for a legacy untagged entry", () => {
    const fields = applyWorkStageRequirement(resolveEntryFields("labour"), {
      isEdit: true,
      existingWorkStage: null,
      entryCreatedAt: "2026-07-01T00:00:00Z",
    });
    expect(fields.find((f) => f.name === "workStage")!.required).toBe(false);
  });

  it("leaves every other field untouched when relaxing", () => {
    const before = resolveEntryFields("labour");
    const after = applyWorkStageRequirement(before, {
      isEdit: true,
      existingWorkStage: null,
      entryCreatedAt: "2026-07-01T00:00:00Z",
    });
    expect(after.filter((f) => f.name !== "workStage"))
      .toEqual(before.filter((f) => f.name !== "workStage"));
  });

  it("does not mutate the shared registry array", () => {
    // The registry is module-level and shared across renders; mutating it would
    // leak one entry's exemption into every later form in the same process.
    const fields = resolveEntryFields("labour");
    applyWorkStageRequirement(fields, {
      isEdit: true, existingWorkStage: null, entryCreatedAt: "2026-07-01T00:00:00Z",
    });
    expect(resolveEntryFields("labour").find((f) => f.name === "workStage")!.required).toBe(true);
  });

  it("is a no-op for entry types with no workStage field", () => {
    const before = resolveEntryFields("incidents");
    const after = applyWorkStageRequirement(before, { isEdit: true });
    expect(after).toEqual(before);
  });
});
```

Append to `components/logs/EntryForm.validate.test.ts`:

```typescript
import { applyWorkStageRequirement, resolveEntryFields } from "./entryFieldRegistry";

describe("work stage validation", () => {
  const base = { siteId: "site-1", isEdit: false, splitLabour: false };

  it("blocks create when Work Stage is empty", () => {
    expect(
      validateEntryValues({
        ...base,
        fields: resolveEntryFields("labour"),
        values: {
          date: "2026-09-05",
          workType: { subcategoryId: "w1", name: "Mason", categoryId: "c1" },
          peopleCount: 2,
          wagePerHead: 700,
          workStage: null,
        },
      }),
    ).toEqual({ field: "workStage", message: "Work Stage is required" });
  });

  it("permits saving a legacy untagged entry", () => {
    expect(
      validateEntryValues({
        ...base,
        isEdit: true,
        fields: applyWorkStageRequirement(resolveEntryFields("labour"), {
          isEdit: true,
          existingWorkStage: null,
          entryCreatedAt: "2026-07-01T00:00:00Z",
        }),
        values: {
          date: "2026-02-04",
          workType: { subcategoryId: "w1", name: "Piling", categoryId: "c1" },
          peopleCount: 1,
          wagePerHead: 40000,
          workStage: null,
        },
      }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- components/logs/entryFieldRegistry.test.ts components/logs/EntryForm.validate.test.ts`
Expected: FAIL — `applyWorkStageRequirement` is not exported, and the `required`/`clearable` assertions fail against the current registry.

- [ ] **Step 3: Flip the registry flags**

In `components/logs/entryFieldRegistry.ts`, for the `workStage` field inside **labour** (~line 61), **machinery** (~line 94) and **expense** (~line 116), change `required: false` to `required: true` and delete the `clearable: true` line. Each of the three should end up reading:

```typescript
    {
      name: "workStage",
      label: "Work Stage",
      kind: "subcategory",
      required: true,
      catalogCategoryName: "Work Stage",
      noun: "Work Stage",
    },
```

Leave the **material** entry exactly as it is — it is already `required: true`.

- [ ] **Step 4: Add the relaxation helper**

Append to `components/logs/entryFieldRegistry.ts`:

```typescript
import {
  isWorkStageRequired,
  type WorkStageRequirementInput,
} from "@/lib/entryTypes/workStageRequirement";

// Work Stage is required on new entries, but entries logged before the field
// existed cannot be forced to invent one. Returns a NEW array — REGISTRY is
// module-level and shared across every render in the process, so mutating it
// would leak one entry's exemption into unrelated forms.
export function applyWorkStageRequirement(
  fields: EntryField[],
  input: WorkStageRequirementInput,
): EntryField[] {
  if (isWorkStageRequired(input)) return fields;
  return fields.map((f) => (f.name === "workStage" ? { ...f, required: false } : f));
}
```

- [ ] **Step 5: Wire it into EntryForm**

In `components/logs/EntryForm.tsx`, add `entryCreatedAt?: string | null;` to the `Props` type (line 30-38), accept it in the destructured parameter list (line 69-77), and change line 80 from:

```typescript
  const fields = resolveEntryFields(categoryName);
```

to:

```typescript
  const fields = applyWorkStageRequirement(resolveEntryFields(categoryName), {
    isEdit: Boolean(entryId),
    existingWorkStage: initialValues?.workStage as string | null | undefined,
    entryCreatedAt,
  });
```

Add `applyWorkStageRequirement` to the existing import from `./entryFieldRegistry` (line 20 area).

Note `isEdit` is declared at line 82, *after* this line — use `Boolean(entryId)` inline rather than reordering declarations.

- [ ] **Step 6: Pass createdAt from the edit page**

In `app/app/logs/[entryId]/page.tsx`, add to the `<EntryForm ... />` props at line 78:

```tsx
        entryCreatedAt={entry.createdAt ? String(entry.createdAt) : null}
```

Verify the loaded `entry` object actually carries `createdAt` — run `grep -n "createdAt" app/app/logs/\[entryId\]/page.tsx`. If the query selects specific columns and omits it, add `createdAt` to that selection. If it is absent the predicate fails strict (requires a stage), which is safe but defeats the exemption, so confirm it is present.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test -- components/logs/`
Expected: PASS. Any pre-existing test asserting `workStage` is optional on labour/machinery/expense will now fail — that is the intended behaviour change; update those assertions rather than reverting the flags.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add components/logs/entryFieldRegistry.ts components/logs/entryFieldRegistry.test.ts \
        components/logs/EntryForm.tsx components/logs/EntryForm.validate.test.ts \
        "app/app/logs/[entryId]/page.tsx"
git commit -m "feat: require Work Stage on new labour/machinery/expense entries"
```

---

### Task 4: Close the API bypass

The form is not a security boundary — a direct POST can still create untagged entries. This closes that, and stops PATCH from un-tagging.

**Files:**
- Modify: `lib/validation/schemas.ts:104` (labourCommonCreateShape), `:195` (updateLabourEntrySchema), `:~240` (machinery create shape), `:~262` (updateMachineryEntrySchema), `:~310` (expenseEntrySchema)
- Test: `lib/validation/schemas.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: no new exports; the existing schemas change shape.

- [ ] **Step 1: Write the failing tests**

Append to `lib/validation/schemas.test.ts`:

```typescript
describe("work stage is mandatory server-side", () => {
  const labour = {
    siteId: "11111111-1111-4111-8111-111111111111",
    date: "2026-09-05",
    workType: "Mason",
    peopleCount: 2,
    wagePerHead: 700,
  };

  it("rejects a labour create with no workStage", () => {
    expect(labourEntrySchema.safeParse(labour).success).toBe(false);
  });

  it("accepts a labour create with a workStage", () => {
    expect(labourEntrySchema.safeParse({ ...labour, workStage: "Basement Level" }).success).toBe(true);
  });

  it("rejects an expense create with no workStage", () => {
    expect(
      expenseEntrySchema.safeParse({
        siteId: "11111111-1111-4111-8111-111111111111",
        date: "2026-09-05",
        description: "Tea",
        amount: 200,
        category: "Food",
      }).success,
    ).toBe(false);
  });

  it("rejects an explicit null workStage on update (un-tagging)", () => {
    expect(updateLabourEntrySchema.safeParse({ workStage: null }).success).toBe(false);
    expect(updateMachineryEntrySchema.safeParse({ workStage: null }).success).toBe(false);
    expect(updateExpenseEntrySchema.safeParse({ workStage: null }).success).toBe(false);
  });

  it("still accepts an update that omits workStage entirely", () => {
    // Legacy entries are edited with workStage absent from the body. The PATCH
    // route only catalog-checks fields that are present, so this must keep working.
    expect(updateLabourEntrySchema.safeParse({ wagePerHead: 800 }).success).toBe(true);
    expect(updateExpenseEntrySchema.safeParse({ amount: 500 }).success).toBe(true);
  });

  it("still accepts an update that sets a workStage", () => {
    expect(updateLabourEntrySchema.safeParse({ workStage: "Roof Level" }).success).toBe(true);
  });
});
```

Add any of `labourEntrySchema`, `expenseEntrySchema`, `updateLabourEntrySchema`, `updateMachineryEntrySchema`, `updateExpenseEntrySchema` missing from the file's existing import statement.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/validation/schemas.test.ts`
Expected: FAIL on the three "rejects" cases — they currently parse successfully.

- [ ] **Step 3: Tighten the create schemas**

In `lib/validation/schemas.ts`:

`labourCommonCreateShape` (~line 104) — drop `.optional()`:

```typescript
  // Shape only; membership checked at the route via assertInCatalogList ("Work Stage").
  workStage: z.string().min(1).max(100),
```

Machinery create shape (~line 240) — the same change, drop `.optional()`.

`expenseEntrySchema` (~line 310) — drop both `.nullable()` and `.optional()`:

```typescript
  // Shape only; membership checked at the route via assertInCatalogList ("Work Stage").
  workStage: z.string().min(1).max(100),
```

- [ ] **Step 4: Tighten the update schemas**

`updateLabourEntrySchema` (line 195) and `updateMachineryEntrySchema` (~line 262) — drop `.nullable()`, keep `.optional()`:

```typescript
  workStage: z.string().min(1).max(100).optional(),
```

`updateExpenseEntrySchema` needs no edit — it is `expenseEntrySchema.partial().omit({ siteId: true })` and inherits Step 3's change. Confirm the test above proves this rather than assuming it.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- lib/validation/schemas.test.ts`
Expected: PASS.

Run: `npm test`
Expected: PASS. Existing route tests that POST without `workStage` will now fail with a 400 — update those fixtures to include a stage; that is the intended change, not a regression to revert.

- [ ] **Step 6: Commit**

```bash
git add lib/validation/schemas.ts lib/validation/schemas.test.ts
git commit -m "feat: reject untagged labour/machinery/expense entries at the API"
```

---

### Task 5: Route-level proof

Task 4 proves the schemas. This proves the routes actually use them and that the legacy-edit path survives end to end.

**Files:**
- Test: `app/api/entries/labour/route.test.ts`
- Test: `app/api/entries/expenses/route.test.ts`
- Test: `app/api/entries/[id]/route.test.ts`

**Interfaces:**
- Consumes: the schema changes from Task 4.
- Produces: nothing.

- [ ] **Step 1: Write the failing tests**

Append to `app/api/entries/labour/route.test.ts`, inside the existing `describe` and following the file's established mock setup (`vi.hoisted` block, `mockRequireSiteAccess`, etc. — copy the arrangement from a neighbouring passing test in the same file rather than inventing one):

```typescript
  it("rejects a create with no workStage", async () => {
    mockRequireSiteAccess.mockResolvedValue({ ok: true });
    mockCheckOwnership.mockReturnValue(true);
    mockFindSite.mockResolvedValue({ siteId: "11111111-1111-4111-8111-111111111111" });

    const res = await POST(
      new NextRequest("http://localhost/api/entries/labour", {
        method: "POST",
        body: JSON.stringify({
          siteId: "11111111-1111-4111-8111-111111111111",
          date: "2026-09-05",
          workType: "Mason",
          peopleCount: 2,
          wagePerHead: 700,
        }),
      }),
    );

    expect(res.status).toBe(400);
    expect(mockInsertLabour).not.toHaveBeenCalled();
  });
```

Add the equivalent to `app/api/entries/expenses/route.test.ts` (asserting `mockInsertExpense` was not called).

Append to `app/api/entries/[id]/route.test.ts`:

```typescript
  it("rejects a PATCH that un-tags an entry", async () => {
    const res = await PATCH(
      new NextRequest("http://localhost/api/entries/e1", {
        method: "PATCH",
        body: JSON.stringify({ workStage: null }),
      }),
      { params: Promise.resolve({ id: "e1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("allows a PATCH on a legacy entry that omits workStage", async () => {
    // The route only catalog-checks fields present in the body (route.ts:101),
    // so a legacy untagged entry stays editable. This is the exemption's
    // server-side half — if it breaks, supervisors cannot correct old wages.
    const res = await PATCH(
      new NextRequest("http://localhost/api/entries/e1", {
        method: "PATCH",
        body: JSON.stringify({ wagePerHead: 800 }),
      }),
      { params: Promise.resolve({ id: "e1" }) },
    );
    expect(res.status).toBe(200);
    expect(mockAssertCatalog).not.toHaveBeenCalledWith("Work Stage", expect.anything());
  });
```

Match the existing file's mock arrangement for entry lookup and update — read the neighbouring tests first and mirror them exactly.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- app/api/entries/`
Expected: the two "rejects" cases FAIL with 200/201 instead of 400.

- [ ] **Step 3: Confirm no implementation change is needed**

These tests should pass on Task 4's schema changes alone — the routes already run `validateBody(descriptor.zodCreate/zodUpdate, ...)`. If a test still fails, the route is not using the schema you changed; find the actual schema it references via `lib/entryTypes/server.ts` and fix that, rather than adding a bespoke check in the route.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- app/api/entries/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/entries/
git commit -m "test: cover work-stage enforcement and the legacy-edit path at the routes"
```

---

### Task 6: The stage aggregate query

Four `GROUP BY work_stage` aggregates, one per entry table. Served by the existing `(site_id, work_stage)` indexes.

**Files:**
- Create: `lib/db/queries/stageSummary.ts`
- Test: `lib/db/queries/stageSummary.test.ts`

**Interfaces:**
- Consumes: `labourSpendSumExpr` from Task 1.
- Produces:
  - `type StageAggregateRow = { stage: string | null; entryType: "labour" | "material" | "machinery" | "expense"; entryCount: number; firstDate: string | null; lastDate: string | null; spend: number }`
  - `getStageAggregates(executor: StageExecutor, siteId: string): Promise<StageAggregateRow[]>`
  - `type StageExecutor = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }`

- [ ] **Step 1: Write the failing test**

```typescript
// lib/db/queries/stageSummary.test.ts
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";

import { describeDb, seedSite, withRollback } from "@/lib/db/testing";
import { labourEntries, materialEntries } from "@/lib/db/schema";

import { getStageAggregates } from "./stageSummary";

describeDb("getStageAggregates", () => {
  it("groups spend and dates by stage, keeping untagged rows as a null stage", async () => {
    await withRollback(async (tx) => {
      const { userId, siteId } = await seedSite(tx);

      await tx.insert(labourEntries).values([
        { siteId, date: "2026-08-01", workType: "Mason", peopleCount: 2,
          wagePerHead: "700", workStage: "Basement Level", createdBy: userId },
        { siteId, date: "2026-08-05", workType: "Helper", peopleCount: 1,
          wagePerHead: "500", workStage: "Basement Level", createdBy: userId },
        { siteId, date: "2026-02-01", workType: "Piling", peopleCount: 1,
          wagePerHead: "40000", workStage: null, createdBy: userId },
      ]);
      await tx.insert(materialEntries).values([
        { siteId, date: "2026-08-03", materialType: "Cement", quantity: "50",
          unit: "Bag", workStage: "Basement Level", cost: "20000", createdBy: userId },
      ]);

      const rows = await getStageAggregates(tx, siteId);

      const labourBasement = rows.find(
        (r) => r.entryType === "labour" && r.stage === "Basement Level",
      );
      expect(labourBasement).toMatchObject({
        entryCount: 2,
        firstDate: "2026-08-01",
        lastDate: "2026-08-05",
        spend: 1900, // 2×700 + 1×500
      });

      const labourUntagged = rows.find(
        (r) => r.entryType === "labour" && r.stage === null,
      );
      expect(labourUntagged).toMatchObject({ entryCount: 1, spend: 40000 });

      const material = rows.find((r) => r.entryType === "material");
      expect(material).toMatchObject({ stage: "Basement Level", entryCount: 1, spend: 20000 });
    });
  });

  it("applies the mason/helper split precedence, not a naive sum", async () => {
    await withRollback(async (tx) => {
      const { userId, siteId } = await seedSite(tx);
      await tx.insert(labourEntries).values([
        // 2 masons @1300 + 2 helpers @1100 = 4800. A naive column sum reads 2400.
        // salaryAmount is also set, to prove split wins the precedence.
        { siteId, date: "2026-08-01", workType: "Mason", peopleCount: 4,
          wagePerHead: "0", salaryAmount: "9999", masonCount: 2, masonSalaryAmount: "1300",
          helperCount: 2, helperSalaryAmount: "1100",
          workStage: "Basement Level", createdBy: userId },
      ]);

      const rows = await getStageAggregates(tx, siteId);
      expect(rows.find((r) => r.entryType === "labour")!.spend).toBe(4800);
    });
  });

  it("returns nothing for a site with no entries", async () => {
    await withRollback(async (tx) => {
      const { siteId } = await seedSite(tx);
      expect(await getStageAggregates(tx, siteId)).toEqual([]);
    });
  });

  it("does not leak another site's entries", async () => {
    await withRollback(async (tx) => {
      const a = await seedSite(tx);
      const b = await seedSite(tx);
      await tx.insert(labourEntries).values({
        siteId: b.siteId, date: "2026-08-01", workType: "Mason", peopleCount: 9,
        wagePerHead: "1000", workStage: "Roof Level", createdBy: b.userId,
      });
      expect(await getStageAggregates(tx, a.siteId)).toEqual([]);
    });
  });

  it("rejects a siteId that is not a uuid", async () => {
    await withRollback(async (tx) => {
      await expect(getStageAggregates(tx, "not-a-uuid")).rejects.toThrow();
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/db/queries/stageSummary.test.ts --testTimeout=30000`
Expected: FAIL — "Failed to resolve import ./stageSummary".

- [ ] **Step 3: Write the implementation**

```typescript
// lib/db/queries/stageSummary.ts
import { sql } from "drizzle-orm";

import { labourSpendSumExpr } from "@/lib/db/queries/labourSpendSql";

// Accepts the shared db or a transaction handle (for rollback-scoped tests).
export type StageExecutor = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

export type StageEntryType = "labour" | "material" | "machinery" | "expense";

export type StageAggregateRow = {
  stage: string | null;
  entryType: StageEntryType;
  entryCount: number;
  firstDate: string | null;
  lastDate: string | null;
  spend: number;
};

type RawRow = {
  stage: string | null;
  entry_type: StageEntryType;
  entry_count: number | string;
  first_date: string | Date | null;
  last_date: string | Date | null;
  spend: number | string | null;
};

function isoDate(value: string | Date | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function rowsOf(result: unknown): RawRow[] {
  // postgres-js returns the rows array directly; other drivers wrap in { rows }.
  if (Array.isArray(result)) return result as RawRow[];
  const wrapped = (result as { rows?: unknown })?.rows;
  return Array.isArray(wrapped) ? (wrapped as RawRow[]) : [];
}

// One roundtrip, four GROUP BYs unioned. Each arm is served by the existing
// (site_id, work_stage) index. Deliberately NOT a per-stage fan-out: that would
// be an N+1 against the connection-pool guard.
//
// work_stage is left NULL rather than coalesced to a sentinel — the caller
// distinguishes "before the field existed" from "skipped", and a magic string
// here would collide with a real catalog value named the same thing.
export async function getStageAggregates(
  executor: StageExecutor,
  siteId: string,
): Promise<StageAggregateRow[]> {
  const result = await executor.execute(sql`
    select work_stage as stage, 'labour' as entry_type, count(*)::int as entry_count,
           min(date)::text as first_date, max(date)::text as last_date,
           coalesce(${labourSpendSumExpr}, 0)::float8 as spend
      from labour_entries where site_id = ${siteId}::uuid group by work_stage
    union all
    select work_stage, 'material', count(*)::int,
           min(date)::text, max(date)::text, coalesce(sum(coalesce(cost,0)),0)::float8
      from material_entries where site_id = ${siteId}::uuid group by work_stage
    union all
    select work_stage, 'machinery', count(*)::int,
           min(date)::text, max(date)::text, coalesce(sum(coalesce(total_cost,0)),0)::float8
      from machinery_entries where site_id = ${siteId}::uuid group by work_stage
    union all
    select work_stage, 'expense', count(*)::int,
           min(date)::text, max(date)::text, coalesce(sum(coalesce(amount,0)),0)::float8
      from expense_entries where site_id = ${siteId}::uuid group by work_stage
  `);

  return rowsOf(result).map((r) => ({
    stage: r.stage,
    entryType: r.entry_type,
    entryCount: Number(r.entry_count),
    firstDate: isoDate(r.first_date),
    lastDate: isoDate(r.last_date),
    spend: Number(r.spend ?? 0),
  }));
}
```

Note `siteId` is bound as a parameter and cast `::uuid`, so a non-uuid string raises a Postgres cast error rather than matching anything — that is what the "rejects a siteId that is not a uuid" test asserts.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/db/queries/stageSummary.test.ts --testTimeout=30000`
Expected: PASS, 5 tests. (Skipped entirely if `DATABASE_URL` is unset — check the output says "skipped", not "passed", before believing a green run.)

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries/stageSummary.ts lib/db/queries/stageSummary.test.ts
git commit -m "feat: add per-stage spend aggregates query"
```

---

### Task 7: Assemble the summary

The pure function that turns Task 6's flat rows into ordered display rows. All the ordering, bucketing and orphan rules live here so they are testable without a database.

**Files:**
- Create: `lib/catalog/stageSummaryView.ts`
- Test: `lib/catalog/stageSummaryView.test.ts`

**Interfaces:**
- Consumes: `StageAggregateRow`, `StageEntryType` from Task 6.
- Produces:
  - `type StageSummaryRow = { key: string; label: string; kind: "stage" | "legacy" | "untagged"; entryCount: number; firstDate: string | null; lastDate: string | null; total: number; byType: Record<StageEntryType, number> }`
  - `buildStageSummary(input: { aggregates: StageAggregateRow[]; catalogOrder: string[] }): StageSummaryRow[]`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/catalog/stageSummaryView.test.ts
import { describe, expect, it } from "vitest";

import type { StageAggregateRow } from "@/lib/db/queries/stageSummary";

import { buildStageSummary } from "./stageSummaryView";

const row = (p: Partial<StageAggregateRow>): StageAggregateRow => ({
  stage: null, entryType: "labour", entryCount: 1,
  firstDate: "2026-08-01", lastDate: "2026-08-01", spend: 100, ...p,
});

const CATALOG = ["Basement Level", "Brick Level", "Roof Level", "Other"];

describe("buildStageSummary", () => {
  it("orders stages by the catalog array, not alphabetically", () => {
    const rows = buildStageSummary({
      aggregates: [
        row({ stage: "Roof Level" }),
        row({ stage: "Basement Level" }),
        row({ stage: "Brick Level" }),
      ],
      catalogOrder: CATALOG,
    });
    expect(rows.map((r) => r.label)).toEqual(["Basement Level", "Brick Level", "Roof Level"]);
  });

  it("omits catalog stages that have no entries", () => {
    const rows = buildStageSummary({
      aggregates: [row({ stage: "Roof Level" })],
      catalogOrder: CATALOG,
    });
    expect(rows.map((r) => r.label)).toEqual(["Roof Level"]);
  });

  it("sums spend across entry types and keeps the per-type split", () => {
    const rows = buildStageSummary({
      aggregates: [
        row({ stage: "Basement Level", entryType: "labour", spend: 54475, entryCount: 15 }),
        row({ stage: "Basement Level", entryType: "material", spend: 530550, entryCount: 29 }),
        row({ stage: "Basement Level", entryType: "machinery", spend: 13610, entryCount: 2 }),
        row({ stage: "Basement Level", entryType: "expense", spend: 3910, entryCount: 5 }),
      ],
      catalogOrder: CATALOG,
    });
    expect(rows[0].total).toBe(602545);
    expect(rows[0].entryCount).toBe(51);
    expect(rows[0].byType).toEqual({
      labour: 54475, material: 530550, machinery: 13610, expense: 3910,
    });
  });

  it("widens the date span across every entry type in the stage", () => {
    const rows = buildStageSummary({
      aggregates: [
        row({ stage: "Basement Level", entryType: "material",
              firstDate: "2026-06-20", lastDate: "2026-08-29" }),
        row({ stage: "Basement Level", entryType: "expense",
              firstDate: "2026-07-31", lastDate: "2026-08-31" }),
      ],
      catalogOrder: CATALOG,
    });
    expect(rows[0].firstDate).toBe("2026-06-20");
    expect(rows[0].lastDate).toBe("2026-08-31");
  });

  it("splits untagged rows into legacy and skipped buckets, placed last", () => {
    const rows = buildStageSummary({
      aggregates: [
        row({ stage: "Basement Level", spend: 500 }),
        row({ stage: null, entryType: "labour", spend: 245100, entryCount: 37,
              firstDate: "2026-02-04", lastDate: "2026-07-20" }),
      ],
      catalogOrder: CATALOG,
    });
    expect(rows.map((r) => r.kind)).toEqual(["stage", "untagged"]);
    expect(rows.at(-1)).toMatchObject({ label: "Not tagged", total: 245100 });
  });

  it("keeps an entry stage that is missing from the catalog, appended after ordered stages", () => {
    // A stage renamed or deactivated in the catalog while entries still carry the
    // old name. Its spend is real; dropping it would silently break the total.
    const rows = buildStageSummary({
      aggregates: [
        row({ stage: "Basement Level", spend: 100 }),
        row({ stage: "Retired Stage", spend: 900 }),
      ],
      catalogOrder: CATALOG,
    });
    expect(rows.map((r) => r.label)).toEqual(["Basement Level", "Retired Stage"]);
    expect(rows[1].kind).toBe("stage");
  });

  it("treats an empty-string stage as untagged, not as its own stage", () => {
    const rows = buildStageSummary({
      aggregates: [row({ stage: "", spend: 50 })],
      catalogOrder: CATALOG,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("untagged");
  });

  it("returns an empty array for a site with no entries", () => {
    expect(buildStageSummary({ aggregates: [], catalogOrder: CATALOG })).toEqual([]);
  });

  it("omits a zero-spend stage that still has entries", () => {
    // Entries with no cost recorded are still activity worth showing.
    const rows = buildStageSummary({
      aggregates: [row({ stage: "Roof Level", spend: 0, entryCount: 3 })],
      catalogOrder: CATALOG,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ total: 0, entryCount: 3 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/catalog/stageSummaryView.test.ts`
Expected: FAIL — "Failed to resolve import ./stageSummaryView".

- [ ] **Step 3: Write the implementation**

```typescript
// lib/catalog/stageSummaryView.ts
import type { StageAggregateRow, StageEntryType } from "@/lib/db/queries/stageSummary";

export type StageRowKind = "stage" | "legacy" | "untagged";

export type StageSummaryRow = {
  key: string;
  label: string;
  kind: StageRowKind;
  entryCount: number;
  firstDate: string | null;
  lastDate: string | null;
  total: number;
  byType: Record<StageEntryType, number>;
};

const UNTAGGED_KEY = "__untagged__";

function emptyByType(): Record<StageEntryType, number> {
  return { labour: 0, material: 0, machinery: 0, expense: 0 };
}

function minDate(a: string | null, b: string | null) {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function maxDate(a: string | null, b: string | null) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

// Turns flat per-(stage, type) aggregates into display rows.
//
// Ordering follows the catalog array's index — the catalog query already sorts
// by sort_order then name, so index IS construction sequence. Stages present on
// entries but absent from the catalog (renamed or deactivated) are appended
// rather than dropped: their spend is real, and losing it would make the page
// disagree with the site total.
export function buildStageSummary(input: {
  aggregates: StageAggregateRow[];
  catalogOrder: string[];
}): StageSummaryRow[] {
  const byKey = new Map<string, StageSummaryRow>();

  for (const agg of input.aggregates) {
    const stage = agg.stage?.trim() ? agg.stage.trim() : null;
    const key = stage ?? UNTAGGED_KEY;

    let row = byKey.get(key);
    if (!row) {
      row = {
        key,
        label: stage ?? "Not tagged",
        kind: stage ? "stage" : "untagged",
        entryCount: 0,
        firstDate: null,
        lastDate: null,
        total: 0,
        byType: emptyByType(),
      };
      byKey.set(key, row);
    }

    row.entryCount += agg.entryCount;
    row.total += agg.spend;
    row.byType[agg.entryType] += agg.spend;
    row.firstDate = minDate(row.firstDate, agg.firstDate);
    row.lastDate = maxDate(row.lastDate, agg.lastDate);
  }

  const rank = new Map(input.catalogOrder.map((name, i) => [name, i]));
  const stages = [...byKey.values()].filter((r) => r.kind === "stage");
  stages.sort((a, b) => {
    // Orphans (absent from the catalog) sort after every known stage, then by name.
    const ra = rank.get(a.label) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b.label) ?? Number.MAX_SAFE_INTEGER;
    return ra - rb || a.label.localeCompare(b.label);
  });

  const untagged = byKey.get(UNTAGGED_KEY);
  return untagged ? [...stages, untagged] : stages;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/catalog/stageSummaryView.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/catalog/stageSummaryView.ts lib/catalog/stageSummaryView.test.ts
git commit -m "feat: add pure stage-summary assembly with ordering and untagged bucketing"
```

---

### Task 8: The page

**Files:**
- Create: `app/app/sites/[id]/stages/page.tsx`
- Create: `app/app/sites/[id]/stages/StageSummaryClient.tsx`
- Modify: `app/app/sites/[id]/SiteDetailPageClient.tsx` (add the entry link)

**Interfaces:**
- Consumes: `getStageAggregates` (Task 6), `buildStageSummary` (Task 7), `loadActiveCatalogNames` from `@/lib/db/queries/catalogLists`.
- Produces: the route `/app/sites/<id>/stages`.

- [ ] **Step 1: Write the server page**

```tsx
// app/app/sites/[id]/stages/page.tsx
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { checkOwnership } from "@/lib/auth/ownership";
import { safeGetSessionFromHeaders } from "@/lib/auth/session";
import { buildStageSummary } from "@/lib/catalog/stageSummaryView";
import { db } from "@/lib/db/client";
import { loadActiveCatalogNames } from "@/lib/db/queries/catalogLists";
import { getStageAggregates } from "@/lib/db/queries/stageSummary";
import { getSiteById } from "@/lib/db/queries/sites";

import StageSummaryClient from "./StageSummaryClient";

export default async function SiteStagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = safeGetSessionFromHeaders(await headers());
  if (!session) redirect("/auth/sign-in");

  const { id: siteId } = await params;

  const site = await getSiteById(siteId);
  if (!site || site.archivedAt) notFound();
  if (!checkOwnership(session.user, site.supervisorId)) notFound();

  // Both are independent reads; run them together rather than sequentially.
  const [aggregates, catalogOrder] = await Promise.all([
    getStageAggregates(db, siteId),
    loadActiveCatalogNames("Work Stage"),
  ]);

  const rows = buildStageSummary({ aggregates, catalogOrder });

  return (
    <StageSummaryClient
      siteId={siteId}
      siteName={site.name}
      budget={site.budget ? Number(site.budget) : null}
      rows={rows}
    />
  );
}
```

Confirm the property names on `site` (`archivedAt`, `supervisorId`, `name`, `budget`) against `getSiteById`'s return type before running — read `lib/db/queries/sites.ts` and adjust if they differ.

- [ ] **Step 2: Write the client component**

```tsx
// app/app/sites/[id]/stages/StageSummaryClient.tsx
"use client";

import Link from "next/link";

import type { StageSummaryRow } from "@/lib/catalog/stageSummaryView";

const TYPE_LABELS = {
  material: "Material",
  labour: "Labour",
  machinery: "Machinery",
  expense: "Expense",
} as const;

function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0,
  }).format(value);
}

function span(row: StageSummaryRow) {
  if (!row.firstDate) return "No dated entries";
  return row.firstDate === row.lastDate
    ? row.firstDate
    : `${row.firstDate} → ${row.lastDate}`;
}

export default function StageSummaryClient({
  siteId, siteName, budget, rows,
}: {
  siteId: string;
  siteName: string;
  budget: number | null;
  rows: StageSummaryRow[];
}) {
  const tracked = rows.reduce((sum, r) => sum + r.total, 0);

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <Link href={`/app/sites/${siteId}`} className="text-sm text-slate-400 hover:underline">
          ← {siteName}
        </Link>
        <h1 className="text-2xl font-bold">Work Stages</h1>
        <p className="text-sm text-slate-400">
          {money(tracked)} tracked
          {budget ? ` of ${money(budget)} budget` : ""}
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">No entries logged for this site yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.key}
              className={`card-standard p-4 ${row.kind !== "stage" ? "border-dashed opacity-80" : ""}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">{row.label}</span>
                <span className="font-semibold">{money(row.total)}</span>
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {/* Derived from entry dates — stages have no tracked start/end. */}
                {span(row)} · {row.entryCount} {row.entryCount === 1 ? "entry" : "entries"}
                {budget ? ` · ${((row.total / budget) * 100).toFixed(1)}% of budget` : ""}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                {(Object.keys(TYPE_LABELS) as Array<keyof typeof TYPE_LABELS>)
                  .filter((t) => row.byType[t] > 0)
                  .map((t) => (
                    <span key={t}>
                      {TYPE_LABELS[t]} {money(row.byType[t])}
                    </span>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add the entry link**

In `app/app/sites/[id]/SiteDetailPageClient.tsx`, add a link alongside the existing operations links. Find how the operations links are rendered (`grep -n "operations" app/app/sites/\[id\]/SiteDetailPageClient.tsx`) and match that markup exactly rather than inventing a new style:

```tsx
<Link href={`/app/sites/${siteId}/stages`}>Work Stages</Link>
```

- [ ] **Step 4: Verify it compiles and renders**

Run: `npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds and lists `/app/sites/[id]/stages` in the route output.

Then start the dev server, open `/app/sites/a401e407-ca5d-4817-ab9f-e19ca98d815d/stages` (the Satheesh site) and confirm against the spec's reference table: Basement Level ₹6,02,545 over Jun 20 → Aug 31, Blockwork/Brickwork ₹2,16,000, Other ₹4,200, Not tagged ₹2,77,020. If a figure differs, the query is wrong — do not adjust the expected numbers.

- [ ] **Step 5: Commit**

```bash
git add "app/app/sites/[id]/stages" "app/app/sites/[id]/SiteDetailPageClient.tsx"
git commit -m "feat: add per-site work stage summary page"
```

---

### Task 9: Stage drill-down

The composition breakdown behind expanding a stage row: material by type, labour by work type. A separate query fired on demand, so the initial page payload stays small.

**Files:**
- Modify: `lib/db/queries/stageSummary.ts` (add a second exported function)
- Create: `app/api/sites/[id]/stages/[stage]/route.ts`
- Modify: `app/app/sites/[id]/stages/StageSummaryClient.tsx` (expand/collapse)
- Test: `lib/db/queries/stageSummary.test.ts` (append)
- Test: `app/api/sites/[id]/stages/[stage]/route.test.ts`

**Interfaces:**
- Consumes: `labourSpendSumExpr` (Task 1), `StageExecutor` (Task 6), `StageSummaryRow` (Task 7).
- Produces:
  - `type StageCompositionRow = { entryType: "labour" | "material"; name: string; entryCount: number; quantity: number | null; unit: string | null; headCount: number | null; spend: number }`
  - `getStageComposition(executor: StageExecutor, siteId: string, stage: string | null): Promise<StageCompositionRow[]>`
  - `GET /api/sites/:id/stages/:stage` → `{ rows: StageCompositionRow[] }`

- [ ] **Step 1: Write the failing query tests**

Append to `lib/db/queries/stageSummary.test.ts`:

```typescript
import { getStageComposition } from "./stageSummary";

describeDb("getStageComposition", () => {
  it("groups material by type and labour by work type", async () => {
    await withRollback(async (tx) => {
      const { userId, siteId } = await seedSite(tx);
      await tx.insert(materialEntries).values([
        { siteId, date: "2026-08-01", materialType: "Cement", quantity: "100",
          unit: "Bag", workStage: "Basement Level", cost: "50000", createdBy: userId },
        { siteId, date: "2026-08-02", materialType: "Cement", quantity: "175",
          unit: "Bag", workStage: "Basement Level", cost: "38000", createdBy: userId },
        { siteId, date: "2026-08-03", materialType: "Metal", quantity: "10",
          unit: "CFT", workStage: "Basement Level", cost: "97950", createdBy: userId },
      ]);
      await tx.insert(labourEntries).values([
        { siteId, date: "2026-08-01", workType: "Steel work", peopleCount: 3,
          wagePerHead: "1000", workStage: "Basement Level", createdBy: userId },
      ]);

      const rows = await getStageComposition(tx, siteId, "Basement Level");

      expect(rows.find((r) => r.name === "Cement")).toMatchObject({
        entryType: "material", entryCount: 2, quantity: 275, unit: "Bag", spend: 88000,
      });
      expect(rows.find((r) => r.name === "Steel work")).toMatchObject({
        entryType: "labour", entryCount: 1, headCount: 3, spend: 3000,
      });
    });
  });

  it("selects untagged rows when the stage is null", async () => {
    await withRollback(async (tx) => {
      const { userId, siteId } = await seedSite(tx);
      await tx.insert(labourEntries).values([
        { siteId, date: "2026-02-01", workType: "Piling", peopleCount: 1,
          wagePerHead: "40000", workStage: null, createdBy: userId },
        { siteId, date: "2026-08-01", workType: "Mason", peopleCount: 1,
          wagePerHead: "700", workStage: "Roof Level", createdBy: userId },
      ]);

      const rows = await getStageComposition(tx, siteId, null);
      expect(rows.map((r) => r.name)).toEqual(["Piling"]);
    });
  });

  it("does not leak another site's entries", async () => {
    await withRollback(async (tx) => {
      const a = await seedSite(tx);
      const b = await seedSite(tx);
      await tx.insert(labourEntries).values({
        siteId: b.siteId, date: "2026-08-01", workType: "Mason", peopleCount: 9,
        wagePerHead: "1000", workStage: "Roof Level", createdBy: b.userId,
      });
      expect(await getStageComposition(tx, a.siteId, "Roof Level")).toEqual([]);
    });
  });

  it("treats a stage name containing SQL metacharacters as a literal", async () => {
    await withRollback(async (tx) => {
      const { siteId } = await seedSite(tx);
      const rows = await getStageComposition(tx, siteId, "' OR 1=1 --");
      expect(rows).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/db/queries/stageSummary.test.ts --testTimeout=30000`
Expected: FAIL — `getStageComposition` is not exported.

- [ ] **Step 3: Write the query**

Append to `lib/db/queries/stageSummary.ts`:

```typescript
export type StageCompositionRow = {
  entryType: "labour" | "material";
  name: string;
  entryCount: number;
  quantity: number | null;
  unit: string | null;
  headCount: number | null;
  spend: number;
};

type RawCompositionRow = {
  entry_type: "labour" | "material";
  name: string;
  entry_count: number | string;
  quantity: number | string | null;
  unit: string | null;
  head_count: number | string | null;
  spend: number | string | null;
};

// Composition of one stage. `stage` is null for the untagged bucket, which needs
// `is not distinct from` rather than `=` — NULL = NULL is NULL in SQL, so a
// plain equality would silently return nothing for the untagged row.
//
// The stage value is bound as a parameter, never interpolated, so a catalog name
// containing quotes is matched literally rather than parsed.
export async function getStageComposition(
  executor: StageExecutor,
  siteId: string,
  stage: string | null,
): Promise<StageCompositionRow[]> {
  const result = await executor.execute(sql`
    select 'material' as entry_type, material_type as name, count(*)::int as entry_count,
           coalesce(sum(quantity),0)::float8 as quantity, max(unit) as unit,
           null::int as head_count, coalesce(sum(coalesce(cost,0)),0)::float8 as spend
      from material_entries
     where site_id = ${siteId}::uuid
       and work_stage is not distinct from ${stage}
     group by material_type
    union all
    select 'labour', work_type, count(*)::int,
           null::float8, null,
           coalesce(sum(coalesce(people_count,0)),0)::int,
           coalesce(${labourSpendSumExpr}, 0)::float8
      from labour_entries
     where site_id = ${siteId}::uuid
       and work_stage is not distinct from ${stage}
     group by work_type
     order by 7 desc
  `);

  return rowsOf(result as unknown).map((r) => {
    const row = r as unknown as RawCompositionRow;
    return {
      entryType: row.entry_type,
      name: row.name,
      entryCount: Number(row.entry_count),
      quantity: row.quantity == null ? null : Number(row.quantity),
      unit: row.unit,
      headCount: row.head_count == null ? null : Number(row.head_count),
      spend: Number(row.spend ?? 0),
    };
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/db/queries/stageSummary.test.ts --testTimeout=30000`
Expected: PASS, 9 tests total across both describeDb blocks.

- [ ] **Step 5: Write the failing API route test**

```typescript
// app/api/sites/[id]/stages/[stage]/route.test.ts
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSession, mockGetSite, mockOwnership, mockComposition } = vi.hoisted(() => ({
  mockSession: vi.fn(),
  mockGetSite: vi.fn(),
  mockOwnership: vi.fn(),
  mockComposition: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ safeGetSessionFromHeaders: mockSession }));
vi.mock("@/lib/auth/ownership", () => ({ checkOwnership: mockOwnership }));
vi.mock("@/lib/db/queries/sites", () => ({ getSiteById: mockGetSite }));
vi.mock("@/lib/db/queries/stageSummary", () => ({ getStageComposition: mockComposition }));
vi.mock("@/lib/db/client", () => ({ db: {} }));

import { GET } from "./route";

const ctx = (stage: string) => ({ params: Promise.resolve({ id: "site-1", stage }) });

describe("GET /api/sites/:id/stages/:stage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.mockReturnValue({ user: { id: "u1" } });
    mockGetSite.mockResolvedValue({ siteId: "site-1", supervisorId: "u1", archivedAt: null });
    mockOwnership.mockReturnValue(true);
    mockComposition.mockResolvedValue([]);
  });

  it("401s with no session", async () => {
    mockSession.mockReturnValue(null);
    expect((await GET(new NextRequest("http://x"), ctx("Roof Level"))).status).toBe(401);
  });

  it("404s when the caller does not own the site", async () => {
    mockOwnership.mockReturnValue(false);
    expect((await GET(new NextRequest("http://x"), ctx("Roof Level"))).status).toBe(404);
  });

  it("404s for an archived site", async () => {
    mockGetSite.mockResolvedValue({ siteId: "site-1", supervisorId: "u1", archivedAt: new Date() });
    expect((await GET(new NextRequest("http://x"), ctx("Roof Level"))).status).toBe(404);
  });

  it("maps the __untagged__ sentinel to a null stage", async () => {
    await GET(new NextRequest("http://x"), ctx("__untagged__"));
    expect(mockComposition).toHaveBeenCalledWith({}, "site-1", null);
  });

  it("passes a decoded stage name through", async () => {
    await GET(new NextRequest("http://x"), ctx(encodeURIComponent("Blockwork/Brickwork")));
    expect(mockComposition).toHaveBeenCalledWith({}, "site-1", "Blockwork/Brickwork");
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test -- "app/api/sites/[id]/stages/[stage]/route.test.ts"`
Expected: FAIL — "Failed to resolve import ./route".

- [ ] **Step 7: Write the route**

```typescript
// app/api/sites/[id]/stages/[stage]/route.ts
import { NextResponse, type NextRequest } from "next/server";

import { checkOwnership } from "@/lib/auth/ownership";
import { safeGetSessionFromHeaders } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { getSiteById } from "@/lib/db/queries/sites";
import { getStageComposition } from "@/lib/db/queries/stageSummary";

// Path sentinel for the untagged bucket. A literal null cannot travel in a URL
// segment, and an empty segment would collapse the route.
const UNTAGGED_SENTINEL = "__untagged__";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; stage: string }> },
) {
  const session = safeGetSessionFromHeaders(request.headers);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: siteId, stage: rawStage } = await context.params;

  // Same guard chain as the page: an unowned or archived site is indistinguishable
  // from a missing one, so ownership cannot be probed through this endpoint.
  const site = await getSiteById(siteId);
  if (!site || site.archivedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!checkOwnership(session.user, site.supervisorId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const decoded = decodeURIComponent(rawStage);
  const stage = decoded === UNTAGGED_SENTINEL ? null : decoded;

  const rows = await getStageComposition(db, siteId, stage);
  return NextResponse.json({ rows });
}
```

Check `safeGetSessionFromHeaders`'s signature — the page passes `await headers()`. If it does not accept a `NextRequest`'s `headers`, mirror whatever a neighbouring API route under `app/api/sites/` does instead.

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test -- "app/api/sites/[id]/stages/[stage]/route.test.ts"`
Expected: PASS, 5 tests.

- [ ] **Step 9: Wire expand/collapse into the client**

In `app/app/sites/[id]/stages/StageSummaryClient.tsx`, add per-row expansion. Add these imports and state:

```tsx
import { useState } from "react";

import type { StageCompositionRow } from "@/lib/db/queries/stageSummary";
```

Inside the component:

```tsx
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, StageCompositionRow[]>>({});
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  async function toggle(row: StageSummaryRow) {
    if (openKey === row.key) {
      setOpenKey(null);
      return;
    }
    setOpenKey(row.key);
    if (detail[row.key]) return; // already fetched; do not refetch on re-expand

    setLoadingKey(row.key);
    try {
      const segment = encodeURIComponent(row.kind === "stage" ? row.label : "__untagged__");
      const res = await fetch(`/api/sites/${siteId}/stages/${segment}`);
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { rows: StageCompositionRow[] };
      setDetail((d) => ({ ...d, [row.key]: body.rows }));
    } catch {
      // Leave the key unset so a retry re-fetches rather than caching a failure.
      setDetail((d) => {
        const next = { ...d };
        delete next[row.key];
        return next;
      });
    } finally {
      setLoadingKey((k) => (k === row.key ? null : k));
    }
  }
```

Make the row header a button calling `toggle(row)`, and render below it when `openKey === row.key`:

```tsx
              {openKey === row.key && (
                <div className="mt-3 border-t border-slate-700 pt-3 text-xs">
                  {loadingKey === row.key && <p className="text-slate-400">Loading…</p>}
                  {loadingKey !== row.key && !detail[row.key] && (
                    <p className="text-slate-400">Could not load the breakdown. Tap to retry.</p>
                  )}
                  {detail[row.key]?.map((d) => (
                    <div key={`${d.entryType}-${d.name}`} className="flex justify-between py-0.5">
                      <span>
                        {d.name}
                        {d.quantity != null && d.unit ? ` · ${d.quantity} ${d.unit}` : ""}
                        {d.headCount != null && d.headCount > 0 ? ` · ${d.headCount} heads` : ""}
                      </span>
                      <span>{money(d.spend)}</span>
                    </div>
                  ))}
                  {detail[row.key]?.length === 0 && (
                    <p className="text-slate-400">No material or labour entries in this stage.</p>
                  )}
                </div>
              )}
```

Note the stale-response case: expanding A then B before A's fetch returns writes both into `detail` keyed separately, so neither overwrites the other. `openKey` alone decides what renders.

- [ ] **Step 10: Verify against real data**

Run: `npm run lint` — expected: no errors.

Start the dev server and expand Basement Level on the Satheesh site. Expected, from the spec's reference figures: Tmt Steel ₹1,71,000, Metal ₹97,950, M sand ₹91,000, Cement ₹88,000 (275 Bag), Red soil/concrete mixture ₹82,600.

- [ ] **Step 11: Commit**

```bash
git add lib/db/queries/stageSummary.ts lib/db/queries/stageSummary.test.ts \
        "app/api/sites/[id]/stages" "app/app/sites/[id]/stages/StageSummaryClient.tsx"
git commit -m "feat: add work stage drill-down with material and labour composition"
```

---

### Task 10: Full-suite regression check

**Files:** none modified unless a failure demands it.

- [ ] **Step 1: Run the whole suite**

Run: `npm test -- --testTimeout=30000`
Expected: PASS. Record the actual pass/fail counts; do not claim green without reading them.

- [ ] **Step 2: Run the type check**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Confirm no production data changed**

Run:

```bash
set -a && . ./.env.local; set +a
psql "$DATABASE_URL" -c "
select 'labour' t, count(*) total, count(*) filter (where work_stage is null) nulls from labour_entries
union all select 'expense', count(*), count(*) filter (where work_stage is null) from expense_entries
union all select 'machinery', count(*), count(*) filter (where work_stage is null) from machinery_entries
union all select 'material', count(*), count(*) filter (where work_stage is null) from material_entries;"
```

Expected, unchanged from the baseline: labour 144/127, expense 127/120, machinery 8/6, material 48/0. Any difference means something wrote to production — stop and report it.

- [ ] **Step 4: Commit if anything needed fixing**

```bash
git add -A
git commit -m "fix: resolve regressions from work stage enforcement"
```
