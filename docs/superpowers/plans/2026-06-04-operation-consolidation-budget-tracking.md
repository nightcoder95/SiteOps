# Operation Consolidation And Budget Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build durable same-day operation consolidation, labour Mason/Helper sections, material-aware units, machinery cost tracking, running totals, and current/agreed site budget display.

**Architecture:** Keep SiteOps' typed entry architecture and add focused helpers around totals, material unit rules, and consolidation keys. Create endpoints still own write-time consolidation; list/detail UI remains a client rendering layer with defensive grouping for old duplicate rows. Schema changes are backward-compatible, with nullable columns for historical rows and validation requiring new fields only for new payloads.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Drizzle ORM, PostgreSQL, Zod, Vitest, Tailwind CSS utilities, Lucide React.

---

## File Structure

- Modify `lib/db/schema.ts`: add labour salary/split fields, machinery total cost, expanded material enum.
- Create `lib/db/migrations/0011_operation_consolidation_budget_tracking.sql`: add nullable DB columns, add CFT unit, seed new material subcategories, and extend material enum.
- Modify `lib/validation/schemas.ts`: add split-labour payload validation, machinery total cost validation, expanded material defaults.
- Modify `lib/validation/schemas.test.ts`: assert split labour, machinery total cost, and new material defaults.
- Create `lib/db/queries/operationTotals.ts`: pure total helpers and consolidation-key helpers that can be tested without a DB connection.
- Modify `lib/db/queries/entries.ts`: use total helpers, add consolidation upsert helpers, include machinery cost in reads/sorts/summaries.
- Modify `lib/db/queries/entries.test.ts`: cover pure helpers and budget-spend calculations.
- Create `lib/db/queries/materialUnits.ts`: material-to-unit rules and display labels.
- Create `lib/db/queries/materialUnits.test.ts`: cover Cement/aggregate/Steel/brick/custom unit rules.
- Modify `lib/db/defaultCatalog.ts`: add material defaults for new installs.
- Modify `app/api/entries/labour/route.ts`: create-or-merge labour entries.
- Modify `app/api/entries/materials/route.ts`: normalize unit and create-or-merge material entries.
- Modify `app/api/entries/machinery/route.ts`: require total cost and create-or-merge machinery entries.
- Modify `app/api/entries/expenses/route.ts`: create-or-merge expense entries and use unified budget spend.
- Modify `app/api/entries/[id]/route.ts`: support patching new labour/machinery fields.
- Modify `components/logs/entryFieldRegistry.ts`: add machinery total cost and mark labour as dynamic-form capable.
- Modify `components/logs/entryFieldRegistry.test.ts`: assert registry changes.
- Modify `components/logs/EntryForm.tsx`: render labour Mason/Helper sections when needed and derive ordinary salary amount.
- Modify `components/logs/UnitSelect.tsx`: accept allowed unit names and display overrides.
- Modify `components/logs/mapEntryToFormValues.ts`: map split labour and machinery cost edit values.
- Modify `app/app/sites/[id]/operations/[type]/OperationDetailPageClient.tsx`: label day totals, add running totals, defensive grouping, aligned filters, and clear filters.
- Modify `app/app/sites/[id]/SiteDetailPageClient.tsx`: display current/agreed budget.
- Modify `app/app/sites/[id]/page.tsx`: fetch current tracked spend.
- Modify `lib/db/queries/sites.ts`: replace expense-only spend helper with unified tracked spend helper.

---

### Task 1: Schema, Catalog, And Validation

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `lib/db/migrations/0011_operation_consolidation_budget_tracking.sql`
- Modify: `lib/db/defaultCatalog.ts`
- Modify: `lib/validation/schemas.ts`
- Modify: `lib/validation/schemas.test.ts`

- [ ] **Step 1: Add failing validation tests**

Append these tests to `lib/validation/schemas.test.ts`:

```ts
import {
  labourSplitWorkTypes,
  machineryEntrySchema,
  updateMachineryEntrySchema,
} from "@/lib/validation/schemas";

describe("operation consolidation schema additions", () => {
  it("exports the labour work types that use Mason and Helper sections", () => {
    expect(labourSplitWorkTypes).toEqual(["Plastering", "Brick work", "Brickwork"]);
  });

  it("accepts split labour payload for Plastering with Mason and Helper amounts", () => {
    const result = labourEntrySchema.safeParse({
      siteId: validSiteId,
      date: validEntryDate,
      workType: "Plastering",
      masonCount: 2,
      masonSalaryAmount: 2600,
      helperCount: 1,
      helperSalaryAmount: 900,
    });

    expect(result.success).toBe(true);
  });

  it("rejects split labour payload when both Mason and Helper are empty", () => {
    const result = labourEntrySchema.safeParse({
      siteId: validSiteId,
      date: validEntryDate,
      workType: "Brickwork",
      masonCount: 0,
      masonSalaryAmount: 0,
      helperCount: 0,
      helperSalaryAmount: 0,
    });

    expect(result.success).toBe(false);
  });

  it("requires machinery totalCost on create", () => {
    const result = machineryEntrySchema.safeParse({
      siteId: validSiteId,
      date: validEntryDate,
      equipmentType: "JCB",
      count: 1,
      hoursActive: 4,
    });

    expect(result.success).toBe(false);
  });

  it("accepts valid machinery totalCost on create", () => {
    const result = machineryEntrySchema.safeParse({
      siteId: validSiteId,
      date: validEntryDate,
      equipmentType: "JCB",
      count: 1,
      hoursActive: 4,
      totalCost: 10000,
    });

    expect(result.success).toBe(true);
  });

  it("allows machinery totalCost on update", () => {
    const result = updateMachineryEntrySchema.safeParse({
      totalCost: 12000,
    });

    expect(result.success).toBe(true);
  });

  it("accepts new default material types", () => {
    for (const materialTypeEnum of ["Steel", "Red Brick", "Cement Block 6in", "Cement Block 4in"] as const) {
      const result = materialEntrySchema.safeParse({
        siteId: validSiteId,
        date: validEntryDate,
        quantity: 25,
        cost: 4200,
        workStage: "Roof Level",
        materialTypeMode: "default_enum",
        materialTypeEnum,
        unitMode: "master",
        unitMasterId: validUnitId,
      });

      expect(result.success).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the validation tests to verify failure**

Run:

```bash
npm test -- lib/validation/schemas.test.ts --run
```

Expected: FAIL because `labourSplitWorkTypes`, `machineryEntrySchema`, `updateMachineryEntrySchema`, split labour fields, `totalCost`, and new material enum values are not wired yet.

- [ ] **Step 3: Add backward-compatible schema fields**

In `lib/db/schema.ts`, change the material enum to:

```ts
export const materialDefaultTypeEnum = pgEnum("material_default_type", [
  "Cement",
  "M sand",
  "P sand",
  "Metal",
  "Steel",
  "Red Brick",
  "Cement Block 6in",
  "Cement Block 4in",
]);
```

In `labourEntries`, after `wagePerHead`, add:

```ts
  salaryAmount: decimal("salary_amount", { precision: 12, scale: 2 }),
  masonCount: integer("mason_count"),
  masonSalaryAmount: decimal("mason_salary_amount", { precision: 12, scale: 2 }),
  helperCount: integer("helper_count"),
  helperSalaryAmount: decimal("helper_salary_amount", { precision: 12, scale: 2 }),
```

In `machineryEntries`, after `hoursActive`, add:

```ts
  totalCost: decimal("total_cost", { precision: 12, scale: 2 }),
```

- [ ] **Step 4: Add the migration**

Create `lib/db/migrations/0011_operation_consolidation_budget_tracking.sql`:

```sql
ALTER TYPE "public"."material_default_type" ADD VALUE IF NOT EXISTS 'Steel';
ALTER TYPE "public"."material_default_type" ADD VALUE IF NOT EXISTS 'Red Brick';
ALTER TYPE "public"."material_default_type" ADD VALUE IF NOT EXISTS 'Cement Block 6in';
ALTER TYPE "public"."material_default_type" ADD VALUE IF NOT EXISTS 'Cement Block 4in';
--> statement-breakpoint

ALTER TABLE "labour_entries"
ADD COLUMN IF NOT EXISTS "salary_amount" numeric(12, 2),
ADD COLUMN IF NOT EXISTS "mason_count" integer,
ADD COLUMN IF NOT EXISTS "mason_salary_amount" numeric(12, 2),
ADD COLUMN IF NOT EXISTS "helper_count" integer,
ADD COLUMN IF NOT EXISTS "helper_salary_amount" numeric(12, 2);
--> statement-breakpoint

ALTER TABLE "machinery_entries"
ADD COLUMN IF NOT EXISTS "total_cost" numeric(12, 2);
--> statement-breakpoint

INSERT INTO "unit_master" ("code", "label", "category")
VALUES ('cft', 'CFT', 'volume')
ON CONFLICT ("code") DO UPDATE
SET "label" = EXCLUDED."label",
    "category" = EXCLUDED."category",
    "is_active" = true,
    "updated_at" = now();
--> statement-breakpoint

DO $$
DECLARE
  materials_id uuid;
BEGIN
  SELECT category_id INTO materials_id
  FROM public.categories
  WHERE name = 'Materials'
  LIMIT 1;

  IF materials_id IS NOT NULL THEN
    INSERT INTO public.subcategories (category_id, name)
    SELECT materials_id, v.name
    FROM (VALUES
      ('Steel'),
      ('Red Brick'),
      ('Cement Block 6in'),
      ('Cement Block 4in')
    ) AS v(name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.subcategories s
      WHERE s.category_id = materials_id
        AND lower(s.name) = lower(v.name)
    );
  END IF;
END $$;
```

- [ ] **Step 5: Update the default in-code catalog**

In `lib/db/defaultCatalog.ts`, change the Materials subcategory list to:

```ts
    subcategories: [
      'Cement',
      'M sand',
      'P sand',
      'Metal',
      'Steel',
      'Red Brick',
      'Cement Block 6in',
      'Cement Block 4in',
    ],
```

- [ ] **Step 6: Update validation schemas**

In `lib/validation/schemas.ts`, replace the material defaults and add split-work exports:

```ts
export const labourSplitWorkTypes = ["Plastering", "Brick work", "Brickwork"] as const;

export function isSplitLabourWorkType(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return normalized === "plastering" || normalized === "brick work" || normalized === "brickwork";
}

const materialDefaultTypes = [
  "Cement",
  "M sand",
  "P sand",
  "Metal",
  "Steel",
  "Red Brick",
  "Cement Block 6in",
  "Cement Block 4in",
] as const;
```

Change `labourEntrySchema` to a common base plus ordinary/split payload union:

```ts
const nonNegativeMoneySchema = z
  .number()
  .min(0)
  .max(100000000)
  .refine((value) => Number(value.toFixed(2)) === value, {
    message: "Value must have at most 2 decimal places",
  });

const labourCommonCreateShape = z.object({
  siteId: uuidSchema,
  date: entryDateSchema,
  remarks: z.string().max(500).optional(),
});

const labourOrdinaryCostShape = z.object({
  peopleCount: z.number().int().positive().max(10000),
  wagePerHead: positiveDecimalSchema(1000000),
  salaryAmount: positiveDecimalSchema(100000000).optional(),
});

const labourSplitCostShape = z.object({
  masonCount: z.number().int().min(0).max(10000).default(0),
  masonSalaryAmount: nonNegativeMoneySchema.default(0),
  helperCount: z.number().int().min(0).max(10000).default(0),
  helperSalaryAmount: nonNegativeMoneySchema.default(0),
}).refine(
  (value) =>
    value.masonCount > 0 ||
    value.helperCount > 0 ||
    value.masonSalaryAmount > 0 ||
    value.helperSalaryAmount > 0,
  { message: "Mason or Helper values are required" },
);

export const labourEntrySchema = labourCommonCreateShape
  .and(z.union([labourLegacyShape, labourDefaultMode, labourCustomMode]))
  .and(z.union([labourOrdinaryCostShape, labourSplitCostShape]));
```

Extend `updateLabourEntrySchema`:

```ts
  salaryAmount: positiveDecimalSchema(100000000).optional(),
  masonCount: z.number().int().min(0).max(10000).optional(),
  masonSalaryAmount: nonNegativeMoneySchema.optional(),
  helperCount: z.number().int().min(0).max(10000).optional(),
  helperSalaryAmount: nonNegativeMoneySchema.optional(),
```

Add `totalCost` to machinery create and update schemas:

```ts
export const machineryEntrySchema = z
  .object({
    siteId: uuidSchema,
    date: entryDateSchema,
    count: z.number().int().positive().max(10000),
    totalCost: positiveDecimalSchema(100000000),
    remarks: z.string().max(500).optional(),
  })
  .and(z.union([machineryLegacyShape, machineryDefaultMode, machineryCustomMode]));
```

```ts
  totalCost: positiveDecimalSchema(100000000).optional(),
```

- [ ] **Step 7: Run the validation tests**

Run:

```bash
npm test -- lib/validation/schemas.test.ts --run
```

Expected: PASS.

- [ ] **Step 8: Commit schema and validation**

Run:

```bash
git add lib/db/schema.ts lib/db/migrations/0011_operation_consolidation_budget_tracking.sql lib/db/defaultCatalog.ts lib/validation/schemas.ts lib/validation/schemas.test.ts
git commit -m "feat: add operation consolidation fields"
```

---

### Task 2: Pure Totals, Merge Keys, And Unit Rules

**Files:**
- Create: `lib/db/queries/operationTotals.ts`
- Modify: `lib/db/queries/entries.test.ts`
- Create: `lib/db/queries/materialUnits.ts`
- Create: `lib/db/queries/materialUnits.test.ts`

- [ ] **Step 1: Add failing tests for operation totals and merge keys**

Replace `lib/db/queries/entries.test.ts` with:

```ts
import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://postgres:postgres@127.0.0.1:5432/siteops_test";

const {
  calculateLabourTotal,
  calculateMaterialUnitRate,
  calculateMachineryTotal,
  calculateSiteTrackedSpend,
  consolidationKeyForEntry,
} = await import("./operationTotals");

describe("entry cost helpers", () => {
  it("calculates ordinary labour total from stored salary amount first", () => {
    expect(calculateLabourTotal({ peopleCount: 10, wagePerHead: "1000.00", salaryAmount: "12345.00" })).toBe(12345);
  });

  it("falls back to people count and wage for historical labour rows", () => {
    expect(calculateLabourTotal({ peopleCount: 10, wagePerHead: "1000.00" })).toBe(10000);
  });

  it("calculates split labour total from Mason and Helper salary amounts", () => {
    expect(calculateLabourTotal({
      masonSalaryAmount: "2600.00",
      helperSalaryAmount: "900.00",
    })).toBe(3500);
  });

  it("returns zero labour total when all salary fields are missing", () => {
    expect(calculateLabourTotal({ peopleCount: 10, wagePerHead: null })).toBe(0);
  });

  it("calculates material unit rate from total cost and quantity", () => {
    expect(calculateMaterialUnitRate("22500.00", "50.00")).toBe(450);
  });

  it("returns null material unit rate when quantity is zero", () => {
    expect(calculateMaterialUnitRate("22500.00", "0")).toBeNull();
  });

  it("calculates machinery total from totalCost", () => {
    expect(calculateMachineryTotal({ totalCost: "10000.00" })).toBe(10000);
  });

  it("builds operation-specific consolidation keys", () => {
    expect(consolidationKeyForEntry("labour", { date: "2026-06-04", workType: "Plastering" })).toBe("2026-06-04|Plastering");
    expect(consolidationKeyForEntry("material", { date: "2026-06-04", materialType: "Cement", workStage: "Roof Level" })).toBe("2026-06-04|Cement|Roof Level");
    expect(consolidationKeyForEntry("machinery", { date: "2026-06-04", equipmentType: "JCB" })).toBe("2026-06-04|JCB");
    expect(consolidationKeyForEntry("expense", { date: "2026-06-04", category: "Labour" })).toBe("2026-06-04|Labour");
  });

  it("calculates tracked spend across cost-bearing operations", () => {
    expect(calculateSiteTrackedSpend({
      labour: [{ salaryAmount: "1000.00" }],
      material: [{ cost: "2000.00" }],
      machinery: [{ totalCost: "3000.00" }],
      expense: [{ amount: "4000.00" }],
    })).toBe(10000);
  });
});
```

- [ ] **Step 2: Add failing tests for material unit rules**

Create `lib/db/queries/materialUnits.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  allowedMaterialUnitNames,
  displayUnitName,
  materialUnitRuleFor,
} from "./materialUnits";

describe("material unit rules", () => {
  it("maps Cement to Bag", () => {
    expect(materialUnitRuleFor("Cement")).toEqual({ allowedNames: ["Bag"], preferredName: "Bag" });
  });

  it("maps sand and Metal to CFT", () => {
    expect(materialUnitRuleFor("M sand").preferredName).toBe("CFT");
    expect(materialUnitRuleFor("P sand").preferredName).toBe("CFT");
    expect(materialUnitRuleFor("Metal").preferredName).toBe("CFT");
  });

  it("maps Steel to KG", () => {
    expect(materialUnitRuleFor("Steel").preferredName).toBe("KG");
  });

  it("maps bricks and cement blocks to Numbers", () => {
    expect(materialUnitRuleFor("Red Brick").preferredName).toBe("Numbers");
    expect(materialUnitRuleFor("Cement Block 6in").preferredName).toBe("Numbers");
    expect(materialUnitRuleFor("Cement Block 4in").preferredName).toBe("Numbers");
  });

  it("allows only Tonne and Litre for custom material", () => {
    expect(allowedMaterialUnitNames("Custom Aggregate")).toEqual(["Tonne", "Litre"]);
  });

  it("normalizes existing master unit labels for display", () => {
    expect(displayUnitName("Bag (50 kg)")).toBe("Bag");
    expect(displayUnitName("Kilogram")).toBe("KG");
    expect(displayUnitName("Nos")).toBe("Numbers");
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
npm test -- lib/db/queries/entries.test.ts lib/db/queries/materialUnits.test.ts --run
```

Expected: FAIL because `operationTotals.ts` and `materialUnits.ts` do not exist.

- [ ] **Step 4: Implement pure operation total helpers**

Create `lib/db/queries/operationTotals.ts`:

```ts
import type { EntryType } from "./entries";

type LabourTotalInput = {
  peopleCount?: number | null;
  wagePerHead?: string | number | null;
  salaryAmount?: string | number | null;
  masonSalaryAmount?: string | number | null;
  helperSalaryAmount?: string | number | null;
};

type MaterialRateInput = string | number | null | undefined;

function finiteNumber(value: string | number | null | undefined) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

export function calculateLabourTotal(rowOrPeople: LabourTotalInput | number | null | undefined, wage?: string | number | null) {
  if (typeof rowOrPeople === "number" || rowOrPeople == null) {
    const people = Number(rowOrPeople ?? 0);
    const wageValue = finiteNumber(wage);
    return Number.isFinite(people) && Number.isFinite(wageValue) ? people * wageValue : 0;
  }

  const splitTotal = finiteNumber(rowOrPeople.masonSalaryAmount) + finiteNumber(rowOrPeople.helperSalaryAmount);
  if (splitTotal > 0) return splitTotal;

  const stored = finiteNumber(rowOrPeople.salaryAmount);
  if (stored > 0) return stored;

  const people = Number(rowOrPeople.peopleCount ?? 0);
  const wageValue = finiteNumber(rowOrPeople.wagePerHead);
  return Number.isFinite(people) && Number.isFinite(wageValue) ? people * wageValue : 0;
}

export function calculateMaterialUnitRate(cost: MaterialRateInput, quantity: MaterialRateInput) {
  const total = finiteNumber(cost);
  const qty = finiteNumber(quantity);
  if (!Number.isFinite(total) || !Number.isFinite(qty) || qty <= 0) return null;
  return total / qty;
}

export function calculateMachineryTotal(row: { totalCost?: string | number | null }) {
  return finiteNumber(row.totalCost);
}

export function consolidationKeyForEntry(type: EntryType, entry: Record<string, unknown>) {
  const date = String(type === "incident" ? entry.createdAt ?? "" : entry.date ?? "").slice(0, 10);
  if (type === "labour") return `${date}|${String(entry.workType ?? "")}`;
  if (type === "material") return `${date}|${String(entry.materialType ?? "")}|${String(entry.workStage ?? "")}`;
  if (type === "machinery") return `${date}|${String(entry.equipmentType ?? "")}`;
  if (type === "expense") return `${date}|${String(entry.category ?? "")}`;
  return `${date}|${String(entry.incidentType ?? "")}|${String(entry.severity ?? "")}`;
}

export function calculateSiteTrackedSpend(rows: {
  labour: LabourTotalInput[];
  material: Array<{ cost?: string | number | null }>;
  machinery: Array<{ totalCost?: string | number | null }>;
  expense: Array<{ amount?: string | number | null }>;
}) {
  return (
    rows.labour.reduce((sum, row) => sum + calculateLabourTotal(row), 0) +
    rows.material.reduce((sum, row) => sum + finiteNumber(row.cost), 0) +
    rows.machinery.reduce((sum, row) => sum + calculateMachineryTotal(row), 0) +
    rows.expense.reduce((sum, row) => sum + finiteNumber(row.amount), 0)
  );
}
```

- [ ] **Step 5: Re-export total helpers from entries query module**

Near the top of `lib/db/queries/entries.ts`, add:

```ts
import {
  calculateLabourTotal,
  calculateMachineryTotal,
  calculateMaterialUnitRate,
} from "@/lib/db/queries/operationTotals";

export {
  calculateLabourTotal,
  calculateMachineryTotal,
  calculateMaterialUnitRate,
};
```

Remove the old local definitions of `calculateLabourTotal` and `calculateMaterialUnitRate`.

- [ ] **Step 6: Implement material unit rules**

Create `lib/db/queries/materialUnits.ts`:

```ts
const KNOWN_RULES: Record<string, string> = {
  cement: "Bag",
  "m sand": "CFT",
  "msand": "CFT",
  "p sand": "CFT",
  "psand": "CFT",
  metal: "CFT",
  steel: "KG",
  "red brick": "Numbers",
  "cement block 6in": "Numbers",
  "cement block 4in": "Numbers",
};

const DISPLAY_OVERRIDES: Record<string, string> = {
  "bag (50 kg)": "Bag",
  kilogram: "KG",
  kg: "KG",
  nos: "Numbers",
  numbers: "Numbers",
  cft: "CFT",
  tonne: "Tonne",
  litre: "Litre",
};

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function displayUnitName(value: string) {
  return DISPLAY_OVERRIDES[normalize(value)] ?? value;
}

export function materialUnitRuleFor(materialType: string | null | undefined) {
  const preferredName = KNOWN_RULES[normalize(String(materialType ?? ""))];
  if (preferredName) {
    return { allowedNames: [preferredName], preferredName };
  }
  return { allowedNames: ["Tonne", "Litre"], preferredName: "Tonne" };
}

export function allowedMaterialUnitNames(materialType: string | null | undefined) {
  return materialUnitRuleFor(materialType).allowedNames;
}

export function unitNameMatchesAllowed(unitName: string, allowedName: string) {
  return displayUnitName(unitName) === allowedName;
}
```

- [ ] **Step 7: Run helper tests**

Run:

```bash
npm test -- lib/db/queries/entries.test.ts lib/db/queries/materialUnits.test.ts --run
```

Expected: PASS.

- [ ] **Step 8: Commit helpers**

Run:

```bash
git add lib/db/queries/operationTotals.ts lib/db/queries/entries.ts lib/db/queries/entries.test.ts lib/db/queries/materialUnits.ts lib/db/queries/materialUnits.test.ts
git commit -m "feat: add operation total and unit helpers"
```

---

### Task 3: Consolidating Create APIs And Budget Spend

**Files:**
- Modify: `lib/db/queries/entries.ts`
- Modify: `lib/db/queries/sites.ts`
- Modify: `app/api/entries/labour/route.ts`
- Modify: `app/api/entries/materials/route.ts`
- Modify: `app/api/entries/machinery/route.ts`
- Modify: `app/api/entries/expenses/route.ts`
- Modify: `app/api/entries/[id]/route.ts`

- [ ] **Step 1: Extend insert data types and add merge helpers**

In `lib/db/queries/entries.ts`, update `insertLabourEntry` data type with:

```ts
  salaryAmount?: string | null;
  masonCount?: number | null;
  masonSalaryAmount?: string | null;
  helperCount?: number | null;
  helperSalaryAmount?: string | null;
```

Update `insertMachineryEntry` data type with:

```ts
  totalCost: string;
```

Then add these helpers below `insertIncidentReport`:

```ts
export async function findMatchingLabourEntry(siteId: string, date: string, workType: string) {
  const rows = await db
    .select()
    .from(labourEntries)
    .where(and(
      eq(labourEntries.siteId, siteId),
      eq(labourEntries.date, date),
      eq(labourEntries.workType, workType),
    ))
    .limit(1);
  return rows[0] ?? null;
}

export async function findMatchingMaterialEntry(siteId: string, date: string, materialType: string, workStage: MaterialWorkStage) {
  const rows = await db
    .select()
    .from(materialEntries)
    .where(and(
      eq(materialEntries.siteId, siteId),
      eq(materialEntries.date, date),
      eq(materialEntries.materialType, materialType),
      eq(materialEntries.workStage, workStage),
    ))
    .limit(1);
  return rows[0] ?? null;
}

export async function findMatchingMachineryEntry(siteId: string, date: string, equipmentType: string) {
  const rows = await db
    .select()
    .from(machineryEntries)
    .where(and(
      eq(machineryEntries.siteId, siteId),
      eq(machineryEntries.date, date),
      eq(machineryEntries.equipmentType, equipmentType),
    ))
    .limit(1);
  return rows[0] ?? null;
}

export async function findMatchingExpenseEntry(siteId: string, date: string, category: "Labour" | "Materials" | "Equipment" | "Misc") {
  const rows = await db
    .select()
    .from(expenseEntries)
    .where(and(
      eq(expenseEntries.siteId, siteId),
      eq(expenseEntries.date, date),
      eq(expenseEntries.category, category),
    ))
    .limit(1);
  return rows[0] ?? null;
}
```

- [ ] **Step 2: Add merge update helpers**

In `lib/db/queries/entries.ts`, add:

```ts
function addDecimal(left: string | number | null | undefined, right: string | number | null | undefined) {
  return String(Number(left ?? 0) + Number(right ?? 0));
}

export async function mergeLabourEntry(existingId: string, data: {
  peopleCount?: number;
  salaryAmount?: string | null;
  masonCount?: number | null;
  masonSalaryAmount?: string | null;
  helperCount?: number | null;
  helperSalaryAmount?: string | null;
  remarks?: string | null;
}) {
  const existing = await getEntryById(existingId, "labour") as typeof labourEntries.$inferSelect | null;
  if (!existing) return null;

  const result = await db
    .update(labourEntries)
    .set({
      peopleCount: Number(existing.peopleCount ?? 0) + Number(data.peopleCount ?? 0),
      salaryAmount: addDecimal(existing.salaryAmount, data.salaryAmount),
      masonCount: Number(existing.masonCount ?? 0) + Number(data.masonCount ?? 0),
      masonSalaryAmount: addDecimal(existing.masonSalaryAmount, data.masonSalaryAmount),
      helperCount: Number(existing.helperCount ?? 0) + Number(data.helperCount ?? 0),
      helperSalaryAmount: addDecimal(existing.helperSalaryAmount, data.helperSalaryAmount),
      remarks: existing.remarks || data.remarks || null,
      updatedAt: new Date(),
    })
    .where(eq(labourEntries.labourEntryId, existingId))
    .returning();
  return result[0] ?? null;
}

export async function mergeMaterialEntry(existingId: string, data: { quantity: string; cost: string; remarks?: string | null }) {
  const existing = await getEntryById(existingId, "material") as typeof materialEntries.$inferSelect | null;
  if (!existing) return null;

  const result = await db
    .update(materialEntries)
    .set({
      quantity: addDecimal(existing.quantity, data.quantity),
      cost: addDecimal(existing.cost, data.cost),
      remarks: existing.remarks || data.remarks || null,
      updatedAt: new Date(),
    })
    .where(eq(materialEntries.materialEntryId, existingId))
    .returning();
  return result[0] ?? null;
}

export async function mergeMachineryEntry(existingId: string, data: { count: number; hoursActive: string | null; totalCost: string; remarks?: string | null }) {
  const existing = await getEntryById(existingId, "machinery") as typeof machineryEntries.$inferSelect | null;
  if (!existing) return null;

  const result = await db
    .update(machineryEntries)
    .set({
      count: Number(existing.count ?? 0) + Number(data.count ?? 0),
      hoursActive: data.hoursActive == null ? existing.hoursActive : addDecimal(existing.hoursActive, data.hoursActive),
      totalCost: addDecimal(existing.totalCost, data.totalCost),
      remarks: existing.remarks || data.remarks || null,
      updatedAt: new Date(),
    })
    .where(eq(machineryEntries.machineryEntryId, existingId))
    .returning();
  return result[0] ?? null;
}

export async function mergeExpenseEntry(existingId: string, data: { amount: string; description: string }) {
  const existing = await getEntryById(existingId, "expense") as typeof expenseEntries.$inferSelect | null;
  if (!existing) return null;

  const result = await db
    .update(expenseEntries)
    .set({
      amount: addDecimal(existing.amount, data.amount),
      description: existing.description || data.description,
      updatedAt: new Date(),
    })
    .where(eq(expenseEntries.expenseEntryId, existingId))
    .returning();
  return result[0] ?? null;
}
```

- [ ] **Step 3: Include machinery cost in summaries and sorting**

In `entrySpend` call sites inside `lib/db/queries/entries.ts`, replace machinery spend null handling in `getSiteOperationSummary`:

```ts
    machinery: {
      todayCount: machinery.length,
      todaySpend: machinery.reduce((sum, row) => sum + calculateMachineryTotal(row), 0),
    },
```

In `fetchMachinery`, wrap rows like cost-bearing types:

```ts
  const fetchMachinery = async () => {
    const rows = await db
      .select()
      .from(machineryEntries)
      .where(and(
        eq(machineryEntries.siteId, siteId),
        dateWhere(machineryEntries.date),
        category ? eq(machineryEntries.equipmentType, category) : undefined,
      ))
      .orderBy(
        sort === "oldest" ? asc(machineryEntries.date) : desc(machineryEntries.date),
        sort === "oldest" ? asc(machineryEntries.createdAt) : desc(machineryEntries.createdAt),
      )
      .limit(limit);
    return sortSpendRows(rows, sort, (row) => calculateMachineryTotal(row));
  };
```

- [ ] **Step 4: Add unified site tracked spend helper**

In `lib/db/queries/sites.ts`, replace `getSiteTotalExpenses` with:

```ts
import {
  expenseEntries,
  labourEntries,
  machineryEntries,
  materialEntries,
  sites,
} from "@/lib/db/schema";
import { calculateSiteTrackedSpend } from "@/lib/db/queries/operationTotals";

export async function getSiteTrackedSpend(siteId: string) {
  const [labour, material, machinery, expense] = await Promise.all([
    db.select().from(labourEntries).where(eq(labourEntries.siteId, siteId)),
    db.select().from(materialEntries).where(eq(materialEntries.siteId, siteId)),
    db.select().from(machineryEntries).where(eq(machineryEntries.siteId, siteId)),
    db.select().from(expenseEntries).where(eq(expenseEntries.siteId, siteId)),
  ]);

  return String(calculateSiteTrackedSpend({ labour, material, machinery, expense }));
}
```

Keep an alias for existing imports during the transition:

```ts
export const getSiteTotalExpenses = getSiteTrackedSpend;
```

- [ ] **Step 5: Update labour create route to merge**

In `app/api/entries/labour/route.ts`, import:

```ts
import {
  findMatchingLabourEntry,
  insertLabourEntry,
  mergeLabourEntry,
} from "@/lib/db/queries/entries";
import { isSplitLabourWorkType } from "@/lib/validation/schemas";
```

After computing `workType`, build cost fields:

```ts
  const workType =
    "workType" in validation.data
      ? (validation.data.workType ?? "Custom")
      : "workTypeEnum" in validation.data
        ? (validation.data.workTypeEnum ?? "Custom")
        : "Custom";
  const splitLabour = isSplitLabourWorkType(workType);
  const salaryAmount = "salaryAmount" in validation.data && validation.data.salaryAmount != null
    ? String(validation.data.salaryAmount)
    : "peopleCount" in validation.data && "wagePerHead" in validation.data
      ? String(Number(validation.data.peopleCount) * Number(validation.data.wagePerHead))
      : null;
```

Inside `try`, before insert:

```ts
    const existing = await findMatchingLabourEntry(siteId, date, workType);
    if (existing) {
      const merged = await mergeLabourEntry(existing.labourEntryId, {
        peopleCount: "peopleCount" in validation.data ? validation.data.peopleCount : 0,
        salaryAmount,
        masonCount: "masonCount" in validation.data ? validation.data.masonCount : null,
        masonSalaryAmount: "masonSalaryAmount" in validation.data ? String(validation.data.masonSalaryAmount) : null,
        helperCount: "helperCount" in validation.data ? validation.data.helperCount : null,
        helperSalaryAmount: "helperSalaryAmount" in validation.data ? String(validation.data.helperSalaryAmount) : null,
        remarks: remarks || null,
      });

      runNonCritical(requestId, "analytics_cache_invalidation_failed", invalidateAdminAnalyticsCache(requestId));
      return successResponse(merged, 200, requestId);
    }
```

Pass the new fields to `insertLabourEntry`:

```ts
      workType,
      peopleCount: "peopleCount" in validation.data ? validation.data.peopleCount : 0,
      wagePerHead: "wagePerHead" in validation.data ? String(validation.data.wagePerHead) : "0",
      salaryAmount,
      masonCount: splitLabour && "masonCount" in validation.data ? validation.data.masonCount : null,
      masonSalaryAmount: splitLabour && "masonSalaryAmount" in validation.data ? String(validation.data.masonSalaryAmount) : null,
      helperCount: splitLabour && "helperCount" in validation.data ? validation.data.helperCount : null,
      helperSalaryAmount: splitLabour && "helperSalaryAmount" in validation.data ? String(validation.data.helperSalaryAmount) : null,
```

- [ ] **Step 6: Update material create route to normalize units and merge**

In `app/api/entries/materials/route.ts`, import:

```ts
import {
  findMatchingMaterialEntry,
  insertMaterialEntry,
  mergeMaterialEntry,
} from "@/lib/db/queries/entries";
import { materialUnitRuleFor } from "@/lib/db/queries/materialUnits";
```

Compute `materialType` and normalized unit before `try`:

```ts
  const materialType =
    "materialType" in validation.data
      ? (validation.data.materialType ?? "Custom")
      : "materialTypeEnum" in validation.data
        ? (validation.data.materialTypeEnum ?? "Custom")
        : "Custom";
  const unitRule = materialUnitRuleFor(materialType);
```

Before insert:

```ts
    const existing = await findMatchingMaterialEntry(siteId, date, materialType, workStage);
    if (existing) {
      const merged = await mergeMaterialEntry(existing.materialEntryId, {
        quantity: String(quantity),
        cost: String(cost),
        remarks: remarks || null,
      });

      runNonCritical(requestId, "analytics_cache_invalidation_failed", invalidateAdminAnalyticsCache(requestId));
      return successResponse(merged, 200, requestId);
    }
```

Pass normalized unit on insert:

```ts
      materialType,
      unit: unitRule.preferredName,
```

- [ ] **Step 7: Update machinery create route to merge**

In `app/api/entries/machinery/route.ts`, import:

```ts
import {
  findMatchingMachineryEntry,
  insertMachineryEntry,
  mergeMachineryEntry,
} from "@/lib/db/queries/entries";
```

Destructure `totalCost`:

```ts
  const { siteId, date, count, totalCost, remarks } = validation.data;
```

Compute `equipmentType` before `try`, then merge:

```ts
  const equipmentType =
    "equipmentType" in validation.data ? (validation.data.equipmentType ?? "Custom") : "Custom";
```

```ts
    const existing = await findMatchingMachineryEntry(siteId, date, equipmentType);
    if (existing) {
      const merged = await mergeMachineryEntry(existing.machineryEntryId, {
        count,
        hoursActive:
          "hoursActive" in validation.data && validation.data.hoursActive != null
            ? String(validation.data.hoursActive)
            : null,
        totalCost: String(totalCost),
        remarks: remarks || null,
      });

      runNonCritical(requestId, "analytics_cache_invalidation_failed", invalidateAdminAnalyticsCache(requestId));
      return successResponse(merged, 200, requestId);
    }
```

Pass `totalCost: String(totalCost)` to `insertMachineryEntry`.

- [ ] **Step 8: Update expense create route to merge and use tracked spend**

In `app/api/entries/expenses/route.ts`, import:

```ts
import {
  findMatchingExpenseEntry,
  insertExpenseEntry,
  mergeExpenseEntry,
} from "@/lib/db/queries/entries";
import { getSiteTrackedSpend } from "@/lib/db/queries/sites";
```

Replace `getSiteTotalExpenses` usage with `getSiteTrackedSpend`.

Before insert:

```ts
    const existing = await findMatchingExpenseEntry(siteId, date, category);
    const entry = existing
      ? await mergeExpenseEntry(existing.expenseEntryId, {
          amount: String(amount),
          description,
        })
      : await insertExpenseEntry({
          siteId,
          date,
          description,
          amount: String(amount),
          category,
          createdBy: auth.session.user.id,
        });
```

Return `successResponse(entry, existing ? 200 : 201, requestId)`.

- [ ] **Step 9: Update patch route numeric conversions**

In `app/api/entries/[id]/route.ts`, add conversions:

```ts
  if (type === "labour" && typeof (updateData as any).salaryAmount === "number") {
    updateData.salaryAmount = String((updateData as any).salaryAmount);
  }
  if (type === "labour" && typeof (updateData as any).masonSalaryAmount === "number") {
    updateData.masonSalaryAmount = String((updateData as any).masonSalaryAmount);
  }
  if (type === "labour" && typeof (updateData as any).helperSalaryAmount === "number") {
    updateData.helperSalaryAmount = String((updateData as any).helperSalaryAmount);
  }
  if (type === "machinery" && typeof (updateData as any).totalCost === "number") {
    updateData.totalCost = String((updateData as any).totalCost);
  }
```

- [ ] **Step 10: Run targeted tests and type check**

Run:

```bash
npm test -- lib/db/queries/entries.test.ts lib/validation/schemas.test.ts --run
npm run lint
```

Expected: PASS.

- [ ] **Step 11: Commit API consolidation**

Run:

```bash
git add lib/db/queries/entries.ts lib/db/queries/sites.ts app/api/entries/labour/route.ts app/api/entries/materials/route.ts app/api/entries/machinery/route.ts app/api/entries/expenses/route.ts app/api/entries/[id]/route.ts
git commit -m "feat: consolidate same-day operation entries"
```

---

### Task 4: Entry Forms And Material-Aware Units

**Files:**
- Modify: `components/logs/entryFieldRegistry.ts`
- Modify: `components/logs/entryFieldRegistry.test.ts`
- Modify: `components/logs/EntryForm.tsx`
- Modify: `components/logs/UnitSelect.tsx`
- Modify: `components/logs/mapEntryToFormValues.ts`

- [ ] **Step 1: Update failing registry tests**

In `components/logs/entryFieldRegistry.test.ts`, change the machinery expectation:

```ts
  it("returns machinery fields for 'Machinery'", () => {
    expect(resolveEntryFields("Machinery").map((f) => f.name)).toEqual([
      "date", "equipmentType", "count", "hoursActive", "totalCost", "remarks",
    ]);
  });
```

Add:

```ts
  it("marks labour as using split role fields dynamically", () => {
    const fields = resolveEntryFields("Labour");
    expect(fields.some((f) => f.name === "workType")).toBe(true);
    expect(fields.some((f) => f.name === "peopleCount")).toBe(true);
    expect(fields.some((f) => f.name === "wagePerHead")).toBe(true);
  });
```

- [ ] **Step 2: Run registry tests to verify failure**

Run:

```bash
npm test -- components/logs/entryFieldRegistry.test.ts --run
```

Expected: FAIL because machinery does not include `totalCost`.

- [ ] **Step 3: Add machinery total cost to registry**

In `components/logs/entryFieldRegistry.ts`, add after `hoursActive` in `machinery`:

```ts
    { name: "totalCost", label: "Total Cost", kind: "number", required: true, min: 0.01, step: 0.01 },
```

- [ ] **Step 4: Make UnitSelect material-aware**

Update `components/logs/UnitSelect.tsx` props:

```ts
type Props = {
  label: string;
  value: UnitOption | null;
  onChange: (value: UnitOption | null) => void;
  required?: boolean;
  allowedNames?: string[];
};
```

Import:

```ts
import { displayUnitName } from "@/lib/db/queries/materialUnits";
```

Change options creation to filter and display normalized unit names:

```ts
  const options: UnitOption[] = [
    ...masterUnits.map((unit) => ({
      unitId: unit.unitId,
      label: displayUnitName(unit.label),
      mode: "master" as const,
      name: displayUnitName(unit.label),
    })),
    ...customUnits.map((unit) => ({
      unitId: unit.unitId,
      label: displayUnitName(unit.symbol ? `${unit.name} (${unit.symbol})` : unit.name),
      mode: "custom" as const,
      name: displayUnitName(unit.name),
    })),
  ].filter((unit) => !allowedNames?.length || allowedNames.includes(unit.name));
```

Add an effect to clear invalid selections:

```ts
  useEffect(() => {
    if (!value || !allowedNames?.length) return;
    if (!allowedNames.includes(value.name)) onChange(null);
  }, [allowedNames, onChange, value]);
```

- [ ] **Step 5: Add split labour state helpers in EntryForm**

In `components/logs/EntryForm.tsx`, import:

```ts
import {
  allowedMaterialUnitNames,
  materialUnitRuleFor,
} from "@/lib/db/queries/materialUnits";
import { isSplitLabourWorkType } from "@/lib/validation/schemas";
```

Add helper near `defaultValue`:

```ts
function selectedSubcategoryName(value: FieldValue) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && "name" in value) return String(value.name);
  return "";
}
```

Inside `EntryForm`, derive:

```ts
  const selectedWorkType = selectedSubcategoryName(values.workType);
  const selectedMaterialType = selectedSubcategoryName(values.materialType);
  const splitLabour = kind === "labour" && isSplitLabourWorkType(selectedWorkType);
```

- [ ] **Step 6: Render split labour role sections**

In the form map, skip ordinary fields when split labour is active:

```tsx
      {fields.map((f) => {
        if (splitLabour && (f.name === "peopleCount" || f.name === "wagePerHead")) return null;
        return (
          <FieldRow
            key={f.name}
            field={f}
            value={values[f.name]}
            onChange={(v) => update(f.name, v)}
            categoryId={categoryId}
            role={role}
            siteId={siteId}
            allowedUnitNames={kind === "material" ? allowedMaterialUnitNames(selectedMaterialType) : undefined}
          />
        );
      })}
      {splitLabour ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[
            ["Mason", "masonCount", "masonSalaryAmount"],
            ["Helper", "helperCount", "helperSalaryAmount"],
          ].map(([label, countName, amountName]) => (
            <section key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-sky-400">{label}</p>
              <div className="space-y-2">
                <label className={labelClass}>Count</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={String(values[countName] ?? "")}
                  onChange={(event) => update(countName, event.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="space-y-2">
                <label className={labelClass}>Salary Amount</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={String(values[amountName] ?? "")}
                  onChange={(event) => update(amountName, event.target.value)}
                  className={inputClass}
                />
              </div>
            </section>
          ))}
        </div>
      ) : null}
```

Add `allowedUnitNames?: string[]` to `FieldRow` props and pass it to `UnitSelect`.

- [ ] **Step 7: Build split labour and material-aware payloads**

In `buildPayload`, after field processing, add:

```ts
    if (kind === "labour" && splitLabour) {
      payload.masonCount = Number(values.masonCount || 0);
      payload.masonSalaryAmount = Number(values.masonSalaryAmount || 0);
      payload.helperCount = Number(values.helperCount || 0);
      payload.helperSalaryAmount = Number(values.helperSalaryAmount || 0);
      delete payload.peopleCount;
      delete payload.wagePerHead;
    }

    if (kind === "labour" && !splitLabour && payload.peopleCount && payload.wagePerHead) {
      payload.salaryAmount = Number(payload.peopleCount) * Number(payload.wagePerHead);
    }

    if (kind === "material" && selectedMaterialType) {
      const rule = materialUnitRuleFor(selectedMaterialType);
      payload.unit = rule.preferredName;
    }
```

- [ ] **Step 8: Map edit values**

In `components/logs/mapEntryToFormValues.ts`, add labour values:

```ts
        salaryAmount: entry.salaryAmount ?? "",
        masonCount: entry.masonCount ?? "",
        masonSalaryAmount: entry.masonSalaryAmount ?? "",
        helperCount: entry.helperCount ?? "",
        helperSalaryAmount: entry.helperSalaryAmount ?? "",
```

Add machinery value:

```ts
        totalCost: entry.totalCost ?? "",
```

- [ ] **Step 9: Run form tests and type check**

Run:

```bash
npm test -- components/logs/entryFieldRegistry.test.ts --run
npm run lint
```

Expected: PASS.

- [ ] **Step 10: Commit form changes**

Run:

```bash
git add components/logs/entryFieldRegistry.ts components/logs/entryFieldRegistry.test.ts components/logs/EntryForm.tsx components/logs/UnitSelect.tsx components/logs/mapEntryToFormValues.ts
git commit -m "feat: add split labour and material-aware units"
```

---

### Task 5: Operation Detail UI

**Files:**
- Modify: `app/app/sites/[id]/operations/[type]/OperationDetailPageClient.tsx`

- [ ] **Step 1: Update entry spend and category key helpers**

In `OperationDetailPageClient.tsx`, update `entrySpend` machinery case:

```ts
  if (type === "machinery") {
    return Number(entry.totalCost ?? 0);
  }
```

Add helper:

```ts
function entryCategoryKey(entry: Entry, type: EntryType) {
  if (type === "labour") return String(entry.workType ?? "Labour");
  if (type === "material") return `${entry.materialType ?? "Material"}|${entry.workStage ?? "Other"}`;
  if (type === "machinery") return String(entry.equipmentType ?? "Machinery");
  if (type === "expense") return String(entry.category ?? "Misc");
  return String(entry.incidentType ?? "Incident");
}
```

- [ ] **Step 2: Add defensive visual grouping**

Replace the `groupedEntries` construction with:

```ts
  const groupedEntries = new Map<string, Map<string, Entry[]>>();
  for (const entry of initialEntries) {
    const dateKey = entryDate(entry, type) || "Unknown";
    const categoryKey = entryCategoryKey(entry, type);
    const dateGroup = groupedEntries.get(dateKey) ?? new Map<string, Entry[]>();
    dateGroup.set(categoryKey, [...(dateGroup.get(categoryKey) ?? []), entry]);
    groupedEntries.set(dateKey, dateGroup);
  }
```

Then build rows with group totals:

```ts
  const groupedRows = [...groupedEntries.entries()].map(([date, categoryGroups]) => ({
    date,
    rows: [...categoryGroups.values()].map((entries) => ({
      entries,
      primary: entries[0],
      total: entries.reduce((sum, entry) => sum + entrySpend(entry, type), 0),
      editable: entries.length === 1,
    })),
  })).sort((left, right) => {
    if (filters.sort === "highest_spend" || filters.sort === "lowest_spend") {
      const leftTotal = left.rows.reduce((sum, row) => sum + row.total, 0);
      const rightTotal = right.rows.reduce((sum, row) => sum + row.total, 0);
      return filters.sort === "highest_spend" ? rightTotal - leftTotal : leftTotal - rightTotal;
    }
    const leftTime = new Date(left.date).getTime();
    const rightTime = new Date(right.date).getTime();
    return filters.sort === "oldest" ? leftTime - rightTime : rightTime - leftTime;
  });
```

- [ ] **Step 3: Add running total lookup**

Before return, add:

```ts
  const chronologicalGroups = [...groupedRows].sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
  const runningTotals = new Map<string, number>();
  const runningByCategory = new Map<string, number>();
  for (const group of chronologicalGroups) {
    for (const row of group.rows) {
      const key = `${group.date}|${entryCategoryKey(row.primary, type)}`;
      const categoryKey = entryCategoryKey(row.primary, type);
      const next = (runningByCategory.get(categoryKey) ?? 0) + row.total;
      runningByCategory.set(categoryKey, next);
      runningTotals.set(key, next);
    }
  }
```

- [ ] **Step 4: Add clear filters action**

Add:

```ts
  function clearFilters() {
    setFilters({ from: "", to: "", category: "", workStage: "", sort: "newest" });
    router.push(`/app/sites/${siteId}/operations/${type}`);
  }
```

Change filter section class:

```tsx
      <section className="card-standard overflow-visible p-4 grid gap-4 md:grid-cols-5">
```

Add button row after sort:

```tsx
        <div className="grid gap-3 md:col-span-5 md:grid-cols-[1fr_auto]">
          <button type="button" onClick={applyFilters} className="btn-primary py-3 h-12">
            Apply Filters
          </button>
          <button type="button" onClick={clearFilters} className="btn-secondary py-3 h-12">
            Clear Filters
          </button>
        </div>
```

Remove the old full-width Apply Filters button.

- [ ] **Step 5: Label day totals and render running totals**

In the date header amount, replace bare currency with:

```tsx
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Day total</span>
                <span className="text-xs font-bold text-sky-400">
                  {formatCurrency(rows.reduce((sum, row) => sum + row.total, 0))}
                </span>
```

In card rendering, use `row.primary` and append:

```tsx
                    {(type === "labour" || type === "material" || type === "machinery" || type === "expense") ? (
                      <div className="mt-3 rounded-xl border border-sky-500/10 bg-sky-500/5 px-3 py-2">
                        <p className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500">Running total</p>
                        <p className="text-sm font-extrabold text-sky-400">
                          {formatCurrency(runningTotals.get(`${date}|${entryCategoryKey(entry, type)}`) ?? row.total)}
                        </p>
                      </div>
                    ) : null}
```

Only show edit/delete controls when `row.editable` is true:

```tsx
                  {row.editable ? (
                    <div className="flex items-center gap-2 shrink-0">
                      ...
                    </div>
                  ) : null}
```

- [ ] **Step 6: Update machinery summary renderer**

In `renderEntrySummary`, add machinery cost:

```tsx
        {entry.totalCost ? <p className="text-sm font-bold text-sky-400">{formatCurrency(Number(entry.totalCost ?? 0))}</p> : null}
```

- [ ] **Step 7: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 8: Commit operation detail UI**

Run:

```bash
git add app/app/sites/[id]/operations/[type]/OperationDetailPageClient.tsx
git commit -m "feat: improve operation detail totals"
```

---

### Task 6: Site Budget Tracking

**Files:**
- Modify: `app/app/sites/[id]/page.tsx`
- Modify: `app/app/sites/[id]/SiteDetailPageClient.tsx`
- Modify: `lib/db/queries/sites.ts`

- [ ] **Step 1: Pass tracked spend into the site detail client**

In `app/app/sites/[id]/page.tsx`, import:

```ts
import { getSiteById, getSiteTrackedSpend } from '@/lib/db/queries/sites';
```

Replace the summary fetch with:

```ts
  const [initialSummary, trackedSpend] = await Promise.all([
    getSiteOperationSummary(siteId),
    getSiteTrackedSpend(siteId),
  ]);
```

Pass prop:

```tsx
      trackedSpend={trackedSpend}
```

- [ ] **Step 2: Add prop and display budget current/agreed**

In `SiteDetailPageClient.tsx`, add prop:

```ts
  trackedSpend: string;
```

Update function signature:

```ts
  trackedSpend,
```

Add helper:

```ts
function formatBudgetPair(current: string, agreed: string | null) {
  const currentFormatted = formatCurrency(Number(current)) ?? '₹0';
  const agreedFormatted = agreed ? formatCurrency(Number(agreed)) : null;
  return agreedFormatted ? `${currentFormatted} / ${agreedFormatted}` : currentFormatted;
}
```

Change Budget stat:

```ts
              {
                label: 'Budget',
                val: formatBudgetPair(trackedSpend, site.budget),
                sub: site.budget ? `${Math.round((Number(trackedSpend) / Number(site.budget)) * 100)}% used` : null,
                icon: TrendingUp,
              },
```

Render `stat.sub` below the value:

```tsx
                {'sub' in stat && stat.sub ? (
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{stat.sub}</p>
                ) : null}
```

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Commit budget display**

Run:

```bash
git add app/app/sites/[id]/page.tsx app/app/sites/[id]/SiteDetailPageClient.tsx lib/db/queries/sites.ts
git commit -m "feat: show tracked spend against budget"
```

---

### Task 7: Verification And Browser Checks

**Files:**
- No required source edits unless verification finds issues.

- [ ] **Step 1: Run focused unit tests**

Run:

```bash
npm test -- lib/validation/schemas.test.ts lib/db/queries/entries.test.ts lib/db/queries/materialUnits.test.ts components/logs/entryFieldRegistry.test.ts --run
```

Expected: PASS.

- [ ] **Step 2: Run full unit suite**

Run:

```bash
npm test -- --run
```

Expected: PASS.

- [ ] **Step 3: Run type check**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Run production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Start dev server**

Run:

```bash
npm run dev
```

Expected: dev server starts on `http://127.0.0.1:3000`.

- [ ] **Step 6: Browser-check key screens**

Use the Browser plugin to open:

```text
http://127.0.0.1:3000/app/sites
```

Manual checks after signing in with available local credentials:

- Site detail budget stat shows current/agreed value.
- Labour form for Plastering shows Mason and Helper sections.
- Material form narrows unit choices after selecting material type.
- Machinery form shows Total Cost.
- Operation detail date header shows `Day total`.
- Operation detail card shows `Running total`.
- Filter controls align on desktop and stack on mobile width.
- Clear Filters resets the URL.

- [ ] **Step 7: Stop dev server**

Stop the `npm run dev` session with `Ctrl-C`.

- [ ] **Step 8: Final status check**

Run:

```bash
git status --short
git log --oneline -6
```

Expected: working tree clean, recent commits correspond to Tasks 1-6.
