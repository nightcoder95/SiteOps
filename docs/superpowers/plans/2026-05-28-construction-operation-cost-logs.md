# Construction Operation Cost Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add construction-cost-aware labour and material logging, accurate operation cards, and typed operation detail pages with filters, summaries, and row actions.

**Architecture:** Keep the existing typed entry architecture. Add first-class database fields for labour wages and material work-stage/cost, then expose derived totals through focused query helpers and pages. UI follows the current dark SiteOps operational dashboard pattern with compact cards, clear filters, and Lucide icon actions.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Drizzle ORM, PostgreSQL, Zod, Vitest, Tailwind-style utility classes, Lucide React.

---

## File Structure

- Modify `lib/db/schema.ts`: add material work-stage enum, labour wage field, material cost/stage fields.
- Create `lib/db/migrations/0010_construction_operation_cost_logs.sql`: add database enum and nullable columns for historical compatibility.
- Modify `lib/validation/schemas.ts`: require `wagePerHead`, `workStage`, and `cost`; export work-stage values.
- Modify `lib/validation/schemas.test.ts`: cover new required fields and invalid values.
- Modify `lib/db/queries/entries.ts`: insert/update new fields, add operation summary/detail helpers, add typed filters.
- Add `lib/db/queries/entries.test.ts`: unit-test pure cost helpers exported from queries.
- Modify `app/api/entries/labour/route.ts`: store `wagePerHead`.
- Modify `app/api/entries/materials/route.ts`: store `workStage` and `cost`.
- Modify `app/api/entries/[id]/route.ts`: convert decimal update fields for labour/material.
- Modify `components/logs/entryFieldRegistry.ts`: add wage, work stage, total cost, and real unit field kind.
- Modify `components/logs/entryFieldRegistry.test.ts`: assert new field definitions.
- Create `components/logs/UnitSelect.tsx`: fetch and render master/custom units for material unit selection.
- Modify `components/logs/EntryForm.tsx`: support `unit` field kind and build correct unit payloads.
- Modify `components/logs/mapEntryToFormValues.ts`: map new edit values.
- Modify `app/api/sites/[id]/entries/route.ts`: accept detail filters and sort.
- Create `app/api/sites/[id]/operation-summary/route.ts`: return today's card counts and spend.
- Modify `app/app/sites/[id]/page.tsx`: fetch operation summary.
- Modify `app/app/sites/[id]/SiteDetailPageClient.tsx`: render operation cards only.
- Create `app/app/sites/[id]/operations/[type]/page.tsx`: server page for typed operation details.
- Create `app/app/sites/[id]/operations/[type]/OperationDetailPageClient.tsx`: filters, grouped rows, summaries, edit/delete.
- Run `npm test -- --run`, `npm run lint`, and targeted manual browser checks.

---

### Task 1: Schema And Validation

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `lib/db/migrations/0010_construction_operation_cost_logs.sql`
- Modify: `lib/validation/schemas.ts`
- Modify: `lib/validation/schemas.test.ts`

- [ ] **Step 1: Write failing validation tests**

Add these tests to `lib/validation/schemas.test.ts`:

```ts
import {
  labourEntrySchema,
  materialEntrySchema,
} from "@/lib/validation/schemas";

describe("labour schemas", () => {
  const base = {
    siteId: "550e8400-e29b-41d4-a716-446655440000",
    date: new Date().toISOString().slice(0, 10),
    workType: "Plumbing",
    peopleCount: 10,
  };

  it("requires per head salary for labour create payload", () => {
    const result = labourEntrySchema.safeParse(base);
    expect(result.success).toBe(false);
  });

  it("accepts valid per head salary for labour create payload", () => {
    const result = labourEntrySchema.safeParse({ ...base, wagePerHead: 1000 });
    expect(result.success).toBe(true);
  });

  it("rejects zero per head salary", () => {
    const result = labourEntrySchema.safeParse({ ...base, wagePerHead: 0 });
    expect(result.success).toBe(false);
  });
});

describe("material schemas", () => {
  const base = {
    siteId: "550e8400-e29b-41d4-a716-446655440000",
    date: new Date().toISOString().slice(0, 10),
    materialType: "Cement",
    quantity: 50,
    unit: "Bags",
  };

  it("requires work stage and total cost for material create payload", () => {
    const result = materialEntrySchema.safeParse(base);
    expect(result.success).toBe(false);
  });

  it("accepts valid work stage and total cost for material create payload", () => {
    const result = materialEntrySchema.safeParse({
      ...base,
      workStage: "Basement Level",
      cost: 22500,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid work stage", () => {
    const result = materialEntrySchema.safeParse({
      ...base,
      workStage: "First Floor",
      cost: 22500,
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- lib/validation/schemas.test.ts --run
```

Expected: validation tests fail because `labourEntrySchema` does not require `wagePerHead` and `materialEntrySchema` does not require `workStage` or `cost`.

- [ ] **Step 3: Update schema definitions**

In `lib/db/schema.ts`, add the enum near the existing enums:

```ts
export const materialWorkStageEnum = pgEnum("material_work_stage", [
  "Basement Level",
  "Brick Level",
  "Lintel Level",
  "Roof Level",
  "Compound Wall",
  "Other",
]);
```

Add to `labourEntries` after `peopleCount`:

```ts
wagePerHead: decimal("wage_per_head", { precision: 12, scale: 2 }),
```

Add to `materialEntries` after `unit`:

```ts
workStage: materialWorkStageEnum("work_stage"),
cost: decimal("cost", { precision: 12, scale: 2 }),
```

Create `lib/db/migrations/0010_construction_operation_cost_logs.sql`:

```sql
CREATE TYPE "material_work_stage" AS ENUM (
  'Basement Level',
  'Brick Level',
  'Lintel Level',
  'Roof Level',
  'Compound Wall',
  'Other'
);

ALTER TABLE "labour_entries"
  ADD COLUMN "wage_per_head" numeric(12, 2);

ALTER TABLE "material_entries"
  ADD COLUMN "work_stage" "material_work_stage",
  ADD COLUMN "cost" numeric(12, 2);

CREATE INDEX "material_entries_site_work_stage_idx"
  ON "material_entries" ("site_id", "work_stage");
```

- [ ] **Step 4: Update validation schemas**

In `lib/validation/schemas.ts`, export material stages after `materialDefaultTypes`:

```ts
export const materialWorkStages = [
  "Basement Level",
  "Brick Level",
  "Lintel Level",
  "Roof Level",
  "Compound Wall",
  "Other",
] as const;
```

Add `wagePerHead` to `labourEntrySchema` base object:

```ts
wagePerHead: z.number().positive().max(1000000),
```

Add `wagePerHead` to `updateLabourEntrySchema`:

```ts
wagePerHead: z.number().positive().max(1000000).optional(),
```

Add `workStage` and `cost` to `materialEntrySchema` base object:

```ts
workStage: z.enum(materialWorkStages),
cost: z.number().positive().max(100000000),
```

Add `workStage` and `cost` to `updateMaterialEntrySchema`:

```ts
workStage: z.enum(materialWorkStages).optional(),
cost: z.number().positive().max(100000000).optional(),
```

- [ ] **Step 5: Run validation tests**

Run:

```bash
npm test -- lib/validation/schemas.test.ts --run
```

Expected: all tests in `lib/validation/schemas.test.ts` pass.

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations/0010_construction_operation_cost_logs.sql lib/validation/schemas.ts lib/validation/schemas.test.ts
git commit -m "feat: add construction cost entry fields"
```

---

### Task 2: Entry Insert, Update, And Cost Helpers

**Files:**
- Modify: `lib/db/queries/entries.ts`
- Add: `lib/db/queries/entries.test.ts`
- Modify: `app/api/entries/labour/route.ts`
- Modify: `app/api/entries/materials/route.ts`
- Modify: `app/api/entries/[id]/route.ts`

- [ ] **Step 1: Add failing helper tests**

Create `lib/db/queries/entries.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  calculateLabourTotal,
  calculateMaterialUnitRate,
} from "./entries";

describe("entry cost helpers", () => {
  it("calculates labour total from people count and wage per head", () => {
    expect(calculateLabourTotal(10, "1000.00")).toBe(10000);
  });

  it("returns zero labour total when wage is missing", () => {
    expect(calculateLabourTotal(10, null)).toBe(0);
  });

  it("calculates material unit rate from total cost and quantity", () => {
    expect(calculateMaterialUnitRate("22500.00", "50.00")).toBe(450);
  });

  it("returns null material unit rate when quantity is zero", () => {
    expect(calculateMaterialUnitRate("22500.00", "0")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- lib/db/queries/entries.test.ts --run
```

Expected: fails because `calculateLabourTotal` and `calculateMaterialUnitRate` are not exported.

- [ ] **Step 3: Add helper functions and insert types**

In `lib/db/queries/entries.ts`, add near the type definitions:

```ts
export function calculateLabourTotal(
  peopleCount: number | null | undefined,
  wagePerHead: string | number | null | undefined,
) {
  const people = Number(peopleCount ?? 0);
  const wage = Number(wagePerHead ?? 0);
  if (!Number.isFinite(people) || !Number.isFinite(wage)) return 0;
  return people * wage;
}

export function calculateMaterialUnitRate(
  cost: string | number | null | undefined,
  quantity: string | number | null | undefined,
) {
  const total = Number(cost ?? 0);
  const qty = Number(quantity ?? 0);
  if (!Number.isFinite(total) || !Number.isFinite(qty) || qty <= 0) return null;
  return total / qty;
}
```

Update `insertLabourEntry` data type to include:

```ts
wagePerHead: string;
```

Update `insertMaterialEntry` data type to include:

```ts
workStage: "Basement Level" | "Brick Level" | "Lintel Level" | "Roof Level" | "Compound Wall" | "Other";
cost: string;
```

- [ ] **Step 4: Store new fields in create routes**

In `app/api/entries/labour/route.ts`, destructure `wagePerHead`:

```ts
const { siteId, date, peopleCount, wagePerHead, remarks } = validation.data;
```

Add to `insertLabourEntry`:

```ts
wagePerHead: String(wagePerHead),
```

In `app/api/entries/materials/route.ts`, destructure `workStage` and `cost`:

```ts
const { siteId, date, quantity, workStage, cost, remarks } = validation.data;
```

Add to `insertMaterialEntry`:

```ts
workStage,
cost: String(cost),
```

- [ ] **Step 5: Convert decimal update fields**

In `app/api/entries/[id]/route.ts`, after material quantity conversion, add:

```ts
if (type === "labour" && typeof (updateData as any).wagePerHead === "number") {
  updateData.wagePerHead = String((updateData as any).wagePerHead);
}
if (type === "material" && typeof (updateData as any).cost === "number") {
  updateData.cost = String((updateData as any).cost);
}
```

- [ ] **Step 6: Run helper and validation tests**

Run:

```bash
npm test -- lib/db/queries/entries.test.ts lib/validation/schemas.test.ts --run
```

Expected: both test files pass.

- [ ] **Step 7: Commit**

```bash
git add lib/db/queries/entries.ts lib/db/queries/entries.test.ts app/api/entries/labour/route.ts app/api/entries/materials/route.ts app/api/entries/[id]/route.ts
git commit -m "feat: persist entry costs"
```

---

### Task 3: Labour And Material Forms

**Files:**
- Modify: `components/logs/entryFieldRegistry.ts`
- Modify: `components/logs/entryFieldRegistry.test.ts`
- Add: `components/logs/UnitSelect.tsx`
- Modify: `components/logs/EntryForm.tsx`
- Modify: `components/logs/mapEntryToFormValues.ts`

- [ ] **Step 1: Update field registry tests first**

In `components/logs/entryFieldRegistry.test.ts`, update expected labour fields:

```ts
expect(fields.map((f) => f.name)).toEqual(["date", "workType", "peopleCount", "wagePerHead", "remarks"]);
```

Update expected material fields:

```ts
expect(resolveEntryFields("Material").map((f) => f.name)).toEqual([
  "date", "materialType", "quantity", "unit", "workStage", "cost", "remarks",
]);
```

Add a test for material unit kind:

```ts
it("uses a real unit selector for material units", () => {
  const unit = resolveEntryFields("Material").find((f) => f.name === "unit");
  expect(unit?.kind).toBe("unit");
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- components/logs/entryFieldRegistry.test.ts --run
```

Expected: fails because the registry has no `unit`, `wagePerHead`, `workStage`, or `cost` field definitions.

- [ ] **Step 3: Update registry**

In `components/logs/entryFieldRegistry.ts`, add `"unit"` to `FieldKind`:

```ts
| "unit"
```

Add `wagePerHead` to labour fields after `peopleCount`:

```ts
{ name: "wagePerHead", label: "Per Head Salary", kind: "number", required: true, min: 0.01, step: 0.01 },
```

Change material `unit` field to:

```ts
{ name: "unit", label: "Unit", kind: "unit", required: true },
```

Add after `unit`:

```ts
{
  name: "workStage",
  label: "Work Stage",
  kind: "select",
  required: true,
  options: [
    { value: "Basement Level", label: "Basement Level" },
    { value: "Brick Level", label: "Brick Level" },
    { value: "Lintel Level", label: "Lintel Level" },
    { value: "Roof Level", label: "Roof Level" },
    { value: "Compound Wall", label: "Compound Wall" },
    { value: "Other", label: "Other" },
  ],
},
{ name: "cost", label: "Total Cost", kind: "number", required: true, min: 0.01, step: 0.01 },
```

- [ ] **Step 4: Add UnitSelect component**

Create `components/logs/UnitSelect.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { requestJson } from "@/lib/http/client";

export type UnitOption = {
  unitId: string;
  label: string;
  mode: "master" | "custom";
  name: string;
};

type MasterUnit = {
  unitId: string;
  code: string;
  label: string;
  category: string;
  isActive: boolean;
};

type CustomUnit = {
  unitId: string;
  name: string;
  symbol: string | null;
  isActive: boolean;
};

type Props = {
  label: string;
  value: UnitOption | null;
  onChange: (value: UnitOption | null) => void;
  required?: boolean;
};

export function UnitSelect({ label, value, onChange, required }: Props) {
  const [master, setMaster] = useState<MasterUnit[]>([]);
  const [custom, setCustom] = useState<CustomUnit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      setLoading(true);
      const [masterRes, customRes] = await Promise.all([
        requestJson<MasterUnit[]>("/api/catalog/units/master", { signal: controller.signal }),
        requestJson<CustomUnit[]>("/api/catalog/units/custom", { signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;
      setLoading(false);
      if (!masterRes.ok) toast.error(masterRes.message);
      if (!customRes.ok) toast.error(customRes.message);
      if (masterRes.ok) setMaster(masterRes.data.filter((u) => u.isActive));
      if (customRes.ok) setCustom(customRes.data.filter((u) => u.isActive));
    })();
    return () => controller.abort();
  }, []);

  const options = useMemo<UnitOption[]>(() => [
    ...master.map((u) => ({
      unitId: u.unitId,
      label: `${u.label} (${u.code})`,
      mode: "master" as const,
      name: u.label,
    })),
    ...custom.map((u) => ({
      unitId: u.unitId,
      label: u.symbol ? `${u.name} (${u.symbol})` : u.name,
      mode: "custom" as const,
      name: u.name,
    })),
  ], [master, custom]);

  return (
    <div className="flex flex-col gap-2">
      <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
        {label}
        {required && " *"}
      </label>
      <select
        value={value ? `${value.mode}:${value.unitId}` : ""}
        onChange={(event) => {
          const next = options.find((u) => `${u.mode}:${u.unitId}` === event.target.value) ?? null;
          onChange(next);
        }}
        required={required}
        disabled={loading}
        className="input-standard appearance-none bg-slate-900"
      >
        <option value="" className="bg-slate-900">
          {loading ? "Loading..." : "Select..."}
        </option>
        {options.map((unit) => (
          <option key={`${unit.mode}:${unit.unitId}`} value={`${unit.mode}:${unit.unitId}`} className="bg-slate-900">
            {unit.label}
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 5: Wire UnitSelect into EntryForm**

In `components/logs/EntryForm.tsx`, import the new component:

```ts
import { UnitSelect, type UnitOption } from "./UnitSelect";
```

Change `FieldValue`:

```ts
type FieldValue = string | number | SubcategoryOption | UnitOption | null;
```

In `defaultValue`, handle `unit`:

```ts
case "unit":
  return null;
```

In `buildPayload`, add this branch before `subcategory`:

```ts
if (f.kind === "unit") {
  const unit = v as UnitOption | null;
  if (unit) {
    payload.unit = unit.name;
    payload.unitMode = unit.mode;
    if (unit.mode === "master") payload.unitMasterId = unit.unitId;
    if (unit.mode === "custom") payload.unitCustomId = unit.unitId;
  }
  continue;
}
```

In `FieldRow`, add a `unit` branch before `subcategory`:

```tsx
if (field.kind === "unit") {
  return (
    <UnitSelect
      label={field.label}
      value={value as UnitOption | null}
      onChange={onChange}
      required={field.required}
    />
  );
}
```

- [ ] **Step 6: Map edit values**

In `components/logs/mapEntryToFormValues.ts`, import `UnitOption`:

```ts
import type { UnitOption } from "./UnitSelect";
```

Add helper:

```ts
function unitOpt(entry: AnyEntry): UnitOption | null {
  const mode = entry.unitMode;
  const id = mode === "master" ? entry.unitMasterId : entry.unitCustomId;
  if ((mode === "master" || mode === "custom") && typeof id === "string" && typeof entry.unit === "string") {
    return { unitId: id, mode, name: entry.unit, label: entry.unit };
  }
  return null;
}
```

In labour mapping, add:

```ts
wagePerHead: entry.wagePerHead ?? "",
```

In material mapping, replace `unit` and add new fields:

```ts
unit: unitOpt(entry) ?? "",
workStage: entry.workStage ?? "",
cost: entry.cost ?? "",
```

- [ ] **Step 7: Run registry tests and lint**

Run:

```bash
npm test -- components/logs/entryFieldRegistry.test.ts --run
npm run lint
```

Expected: registry tests pass; TypeScript reports no errors from the new `unit` field kind.

- [ ] **Step 8: Commit**

```bash
git add components/logs/entryFieldRegistry.ts components/logs/entryFieldRegistry.test.ts components/logs/UnitSelect.tsx components/logs/EntryForm.tsx components/logs/mapEntryToFormValues.ts
git commit -m "feat: add cost-aware entry form fields"
```

---

### Task 4: Operation Summary And Detail Query API

**Files:**
- Modify: `lib/db/queries/entries.ts`
- Modify: `app/api/sites/[id]/entries/route.ts`
- Add: `app/api/sites/[id]/operation-summary/route.ts`

- [ ] **Step 1: Add query types and helpers**

In `lib/db/queries/entries.ts`, add:

```ts
export type OperationEntryType = EntryType;

export type OperationDetailFilters = EntriesFilters & {
  category?: string;
  workStage?: "Basement Level" | "Brick Level" | "Lintel Level" | "Roof Level" | "Compound Wall" | "Other";
  sort?: "newest" | "oldest" | "highest_spend" | "lowest_spend";
};

export type SiteOperationSummary = Record<EntryType, {
  todayCount: number;
  todaySpend: number | null;
}>;
```

Add a `todayIso` helper:

```ts
function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}
```

- [ ] **Step 2: Add summary query**

Add to `lib/db/queries/entries.ts`:

```ts
export async function getSiteOperationSummary(siteId: string, date = todayIsoDate()): Promise<SiteOperationSummary> {
  const [labour, material, machinery, expense, incident] = await Promise.all([
    db.select().from(labourEntries).where(and(eq(labourEntries.siteId, siteId), eq(labourEntries.date, date))),
    db.select().from(materialEntries).where(and(eq(materialEntries.siteId, siteId), eq(materialEntries.date, date))),
    db.select().from(machineryEntries).where(and(eq(machineryEntries.siteId, siteId), eq(machineryEntries.date, date))),
    db.select().from(expenseEntries).where(and(eq(expenseEntries.siteId, siteId), eq(expenseEntries.date, date))),
    db.select().from(incidentReports).where(and(eq(incidentReports.siteId, siteId), eq(sql`${incidentReports.createdAt}::date`, date))),
  ]);

  return {
    labour: {
      todayCount: labour.length,
      todaySpend: labour.reduce((sum, row) => sum + calculateLabourTotal(row.peopleCount, row.wagePerHead), 0),
    },
    material: {
      todayCount: material.length,
      todaySpend: material.reduce((sum, row) => sum + Number(row.cost ?? 0), 0),
    },
    machinery: { todayCount: machinery.length, todaySpend: null },
    expense: {
      todayCount: expense.length,
      todaySpend: expense.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
    },
    incident: { todayCount: incident.length, todaySpend: null },
  };
}
```

- [ ] **Step 3: Add operation summary API**

Create `app/api/sites/[id]/operation-summary/route.ts`:

```ts
import { requireSiteAccess } from "@/lib/auth/guards";
import { checkOwnership } from "@/lib/auth/ownership";
import { getSiteOperationSummary } from "@/lib/db/queries/entries";
import { getSiteById } from "@/lib/db/queries/sites";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { withApiRoute } from "@/lib/http/withApi";

type RouteCtx = { params: Promise<{ id: string }> };

export const GET = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const { id: siteId } = await context.params;
  const [auth, site] = await Promise.all([requireSiteAccess(request), getSiteById(siteId)]);

  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }
  if (!site || site.archivedAt) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Site not found", 404, undefined, requestId);
  }
  if (!checkOwnership(auth.session.user, site.supervisorId)) {
    return errorResponse(ERROR_CODES.FORBIDDEN, "You can only view entries for sites you supervise", 403, undefined, requestId);
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? undefined;
  const summary = await getSiteOperationSummary(siteId, date);
  return successResponse(summary, 200, requestId);
});
```

- [ ] **Step 4: Extend detail filtering**

In `app/api/sites/[id]/entries/route.ts`, read extra parameters:

```ts
const category = searchParams.get("category") ?? undefined;
const workStage = searchParams.get("workStage") ?? undefined;
const sort = searchParams.get("sort") ?? undefined;
```

Pass them to `getEntriesBySite`:

```ts
const data = await getEntriesBySite(siteId, type as any, {
  from,
  to,
  limit,
  category,
  workStage: workStage as any,
  sort: sort as any,
});
```

In `lib/db/queries/entries.ts`, update `EntriesFilters` to include the same keys:

```ts
category?: string;
workStage?: "Basement Level" | "Brick Level" | "Lintel Level" | "Roof Level" | "Compound Wall" | "Other";
sort?: "newest" | "oldest" | "highest_spend" | "lowest_spend";
```

Inside each fetch function, add category/work-stage filters where relevant:

```ts
const sort = filters?.sort ?? "newest";
const dateOrder = sort === "oldest" ? asc : desc;
```

Use `dateOrder(table.date)` for oldest/newest. For spend sorting, fetch the limited rows ordered by date and sort in memory before returning:

```ts
function sortSpendRows<T>(rows: T[], amount: (row: T) => number) {
  if (sort === "highest_spend") return [...rows].sort((a, b) => amount(b) - amount(a));
  if (sort === "lowest_spend") return [...rows].sort((a, b) => amount(a) - amount(b));
  return rows;
}
```

Apply to labour, material, and expense after the DB result:

```ts
return sortSpendRows(rows, (row) => calculateLabourTotal(row.peopleCount, row.wagePerHead));
```

```ts
return sortSpendRows(rows, (row) => Number(row.cost ?? 0));
```

```ts
return sortSpendRows(rows, (row) => Number(row.amount ?? 0));
```

- [ ] **Step 5: Run lint**

Run:

```bash
npm run lint
```

Expected: TypeScript accepts the new endpoint and query types.

- [ ] **Step 6: Commit**

```bash
git add lib/db/queries/entries.ts app/api/sites/[id]/entries/route.ts app/api/sites/[id]/operation-summary/route.ts
git commit -m "feat: add operation summary queries"
```

---

### Task 5: Site Detail Operation Cards

**Files:**
- Modify: `app/app/sites/[id]/page.tsx`
- Modify: `app/app/sites/[id]/SiteDetailPageClient.tsx`

- [ ] **Step 1: Update server page data**

In `app/app/sites/[id]/page.tsx`, replace the initial entries fetch import:

```ts
import { getSiteOperationSummary } from '@/lib/db/queries/entries';
```

Replace:

```ts
const initialEntries = await getEntriesBySite(siteId, 'all', { limit: DEFAULT_ENTRIES_LIMIT });
```

With:

```ts
const initialSummary = await getSiteOperationSummary(siteId);
```

Pass the prop:

```tsx
<SiteDetailPageClient
  siteId={siteId}
  initialSite={serializeRow(site) as any}
  initialSummary={serializeRow(initialSummary) as any}
  role={session.user.role as "Admin" | "Supervisor"}
/>
```

- [ ] **Step 2: Replace site detail operation UI**

In `SiteDetailPageClient.tsx`, remove state and functions tied to `entriesResult`, `type`, `loading`, and `onChangeType`.

Use this type:

```ts
type OperationType = 'labour' | 'material' | 'machinery' | 'expense' | 'incident';
type OperationSummary = Record<OperationType, { todayCount: number; todaySpend: number | null }>;
```

Update props:

```ts
type SiteDetailPageClientProps = {
  siteId: string;
  initialSite: Site;
  initialSummary: OperationSummary;
  role: 'Admin' | 'Supervisor';
};
```

Add formatter:

```ts
function formatCurrency(value: number | null) {
  if (value == null) return null;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}
```

Render cards:

```tsx
const operations: Array<{ type: OperationType; label: string; icon: typeof FileText }> = [
  { type: 'labour', label: 'Labour', icon: FileText },
  { type: 'material', label: 'Material', icon: Layers },
  { type: 'machinery', label: 'Machinery', icon: Repeat },
  { type: 'expense', label: 'Expense', icon: TrendingUp },
  { type: 'incident', label: 'Incident', icon: AlertCircle },
];
```

Replace the filter/list section with:

```tsx
<div className="flex items-center justify-between px-1">
  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
    Operations Queue <FileText className="w-4 h-4 text-sky-500" />
  </h3>
</div>

<section className="grid gap-4 md:grid-cols-2">
  {operations.map((operation) => {
    const Icon = operation.icon;
    const summary = initialSummary[operation.type];
    const spend = formatCurrency(summary.todaySpend);
    return (
      <Link
        key={operation.type}
        href={`/app/sites/${siteId}/operations/${operation.type}`}
        className={`card-standard group p-5 border-2 ${getTypeColor(operation.type).split(' ')[2]} hover:bg-white/5 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500/70`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <span className={`inline-flex text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-lg border ${getTypeColor(operation.type)}`}>
              {operation.label}
            </span>
            <div>
              <p className="text-3xl font-extrabold text-white">{summary.todayCount}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Entries Today</p>
            </div>
            {spend ? (
              <p className="text-sm font-bold text-slate-200">{spend}</p>
            ) : null}
            <p className="text-[10px] font-bold uppercase tracking-widest text-sky-400">Click for details</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-500 group-hover:text-sky-400 transition-colors">
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </Link>
    );
  })}
</section>
```

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: no unused imports remain from the old filter/list UI.

- [ ] **Step 4: Commit**

```bash
git add app/app/sites/[id]/page.tsx app/app/sites/[id]/SiteDetailPageClient.tsx
git commit -m "feat: show operation summary cards"
```

---

### Task 6: Operation Detail Page UI

**Files:**
- Add: `app/app/sites/[id]/operations/[type]/page.tsx`
- Add: `app/app/sites/[id]/operations/[type]/OperationDetailPageClient.tsx`

- [ ] **Step 1: Add server page**

Create `app/app/sites/[id]/operations/[type]/page.tsx`:

```tsx
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { checkOwnership } from "@/lib/auth/ownership";
import { safeGetSessionFromHeaders } from "@/lib/auth/session";
import { getEntriesBySite, type EntryType } from "@/lib/db/queries/entries";
import { getSiteById } from "@/lib/db/queries/sites";
import { serializeRow } from "@/lib/utils/serialize";

import OperationDetailPageClient from "./OperationDetailPageClient";

const allowed = ["labour", "material", "machinery", "expense", "incident"] as const;

export default async function OperationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; type: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = safeGetSessionFromHeaders(await headers());
  if (!session) redirect("/auth/sign-in");

  const { id: siteId, type } = await params;
  if (!allowed.includes(type as EntryType)) notFound();

  const site = await getSiteById(siteId);
  if (!site || site.archivedAt) notFound();
  if (!checkOwnership(session.user, site.supervisorId)) notFound();

  const query = await searchParams;
  const getOne = (key: string) => {
    const value = query[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const entries = await getEntriesBySite(siteId, type as EntryType, {
    from: getOne("from"),
    to: getOne("to"),
    category: getOne("category"),
    workStage: getOne("workStage") as any,
    sort: (getOne("sort") as any) ?? "newest",
    limit: 200,
  });

  return (
    <OperationDetailPageClient
      site={serializeRow(site) as any}
      siteId={siteId}
      type={type as EntryType}
      initialEntries={serializeRow(entries) as any}
      initialFilters={{
        from: getOne("from") ?? "",
        to: getOne("to") ?? "",
        category: getOne("category") ?? "",
        workStage: getOne("workStage") ?? "",
        sort: getOne("sort") ?? "newest",
      }}
    />
  );
}
```

- [ ] **Step 2: Add client page shell**

Create `app/app/sites/[id]/operations/[type]/OperationDetailPageClient.tsx` with this structure:

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Edit3, FileText, Layers, Repeat, Trash2, TrendingUp } from "lucide-react";

import { requestJson } from "@/lib/http/client";
import type { EntryType } from "@/lib/db/queries/entries";

type Site = { siteId: string; name: string; location: string };
type Entry = Record<string, any>;
type Filters = { from: string; to: string; category: string; workStage: string; sort: string };

type Props = {
  site: Site;
  siteId: string;
  type: EntryType;
  initialEntries: Entry[];
  initialFilters: Filters;
};

const labels: Record<EntryType, string> = {
  labour: "Labour",
  material: "Material",
  machinery: "Machinery",
  expense: "Expense",
  incident: "Incident",
};

const icons = {
  labour: FileText,
  material: Layers,
  machinery: Repeat,
  expense: TrendingUp,
  incident: AlertCircle,
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN");
}

function rowId(entry: Entry, type: EntryType) {
  if (type === "labour") return entry.labourEntryId;
  if (type === "material") return entry.materialEntryId;
  if (type === "machinery") return entry.machineryEntryId;
  if (type === "expense") return entry.expenseEntryId;
  return entry.incidentReportId;
}

function rowDate(entry: Entry, type: EntryType) {
  return type === "incident" ? String(entry.createdAt ?? "").slice(0, 10) : String(entry.date ?? "");
}

function rowSpend(entry: Entry, type: EntryType) {
  if (type === "labour") return Number(entry.peopleCount ?? 0) * Number(entry.wagePerHead ?? 0);
  if (type === "material") return Number(entry.cost ?? 0);
  if (type === "expense") return Number(entry.amount ?? 0);
  return 0;
}

export default function OperationDetailPageClient({ site, siteId, type, initialEntries, initialFilters }: Props) {
  const router = useRouter();
  const [filters, setFilters] = useState(initialFilters);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const Icon = icons[type];

  const grouped = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const entry of initialEntries) {
      const key = rowDate(entry, type) || "Unknown";
      map.set(key, [...(map.get(key) ?? []), entry]);
    }
    return [...map.entries()];
  }, [initialEntries, type]);

  const totalSpend = initialEntries.reduce((sum, entry) => sum + rowSpend(entry, type), 0);

  const materialStageTotals = useMemo(() => {
    const stages = ["Basement Level", "Brick Level", "Lintel Level", "Roof Level", "Compound Wall", "Other"];
    return stages.map((stage) => ({
      stage,
      total: initialEntries
        .filter((entry) => entry.workStage === stage)
        .reduce((sum, entry) => sum + Number(entry.cost ?? 0), 0),
    }));
  }, [initialEntries]);

  function applyFilters() {
    const params = new URLSearchParams();
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.category) params.set("category", filters.category);
    if (filters.workStage) params.set("workStage", filters.workStage);
    if (filters.sort) params.set("sort", filters.sort);
    router.push(`/app/sites/${siteId}/operations/${type}?${params.toString()}`);
  }

  async function deleteEntry(entry: Entry) {
    const id = rowId(entry, type);
    if (!id) return;
    const confirmed = window.confirm("Delete this log entry?");
    if (!confirmed) return;
    setDeletingId(id);
    const res = await requestJson<null>(`/api/entries/${id}?type=${type}`, { method: "DELETE" });
    setDeletingId(null);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success("Entry deleted");
    router.refresh();
  }

  return (
    <div className="space-y-6 pt-2 pb-20 max-w-5xl mx-auto">
      <section className="card-standard p-5 border-sky-500/10 bg-sky-500/5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Link href={`/app/sites/${siteId}`} className="text-[10px] font-bold uppercase tracking-widest text-sky-400 hover:text-sky-300">
              Back to site
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-sky-400">
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold uppercase tracking-tight text-white">{labels[type]} Logs</h1>
                <p className="text-xs text-slate-500 font-semibold">{site.name}</p>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-extrabold text-white">{initialEntries.length}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Logs</p>
            {type === "labour" || type === "material" || type === "expense" ? (
              <p className="mt-2 text-sm font-bold text-sky-400">{formatCurrency(totalSpend)}</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="card-standard p-4 grid gap-3 md:grid-cols-5">
        <input type="date" value={filters.from} onChange={(e) => setFilters((s) => ({ ...s, from: e.target.value }))} className="input-standard" aria-label="From date" />
        <input type="date" value={filters.to} onChange={(e) => setFilters((s) => ({ ...s, to: e.target.value }))} className="input-standard" aria-label="To date" />
        <input type="text" value={filters.category} onChange={(e) => setFilters((s) => ({ ...s, category: e.target.value }))} aria-label="Category" className="input-standard" />
        {type === "material" ? (
          <select value={filters.workStage} onChange={(e) => setFilters((s) => ({ ...s, workStage: e.target.value }))} className="input-standard appearance-none bg-slate-900" aria-label="Work stage">
            <option value="" className="bg-slate-900">All stages</option>
            {materialStageTotals.map((item) => <option key={item.stage} value={item.stage} className="bg-slate-900">{item.stage}</option>)}
          </select>
        ) : null}
        <select value={filters.sort} onChange={(e) => setFilters((s) => ({ ...s, sort: e.target.value }))} className="input-standard appearance-none bg-slate-900" aria-label="Sort">
          <option value="newest" className="bg-slate-900">Newest first</option>
          <option value="oldest" className="bg-slate-900">Oldest first</option>
          {(type === "labour" || type === "material" || type === "expense") ? (
            <>
              <option value="highest_spend" className="bg-slate-900">Highest spend</option>
              <option value="lowest_spend" className="bg-slate-900">Lowest spend</option>
            </>
          ) : null}
        </select>
        <button type="button" onClick={applyFilters} className="btn-primary md:col-span-5 py-3">Apply Filters</button>
      </section>

      {type === "material" ? (
        <section className="grid gap-3 md:grid-cols-3">
          {materialStageTotals.map((item) => (
            <div key={item.stage} className="card-standard p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{item.stage}</p>
              <p className="mt-1 text-lg font-extrabold text-white">{formatCurrency(item.total)}</p>
            </div>
          ))}
        </section>
      ) : null}

      <section className="space-y-4">
        {grouped.map(([date, rows]) => (
          <div key={date} className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">{formatDate(date)}</h2>
              {(type === "labour" || type === "material" || type === "expense") ? (
                <span className="text-xs font-bold text-sky-400">{formatCurrency(rows.reduce((sum, entry) => sum + rowSpend(entry, type), 0))}</span>
              ) : null}
            </div>
            {rows.map((entry) => (
              <div key={rowId(entry, type)} className="card-standard p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">{renderEntrySummary(entry, type)}</div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link href={`/app/logs/${rowId(entry, type)}?type=${type}`} aria-label="Edit entry" className="w-10 h-10 rounded-xl border border-white/10 bg-white/5 text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 flex items-center justify-center transition-colors">
                    <Edit3 className="w-4 h-4" />
                  </Link>
                  <button type="button" onClick={() => void deleteEntry(entry)} disabled={deletingId === rowId(entry, type)} aria-label="Delete entry" className="w-10 h-10 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center justify-center transition-colors disabled:opacity-50">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Add row summary renderer**

Append this function inside `OperationDetailPageClient.tsx`:

```tsx
function renderEntrySummary(entry: Entry, type: EntryType) {
  if (type === "labour") {
    const total = rowSpend(entry, type);
    return (
      <div className="space-y-1">
        <p className="font-bold text-slate-100">{entry.workType ?? "Labour"}</p>
        <p className="text-xs text-slate-500">{entry.peopleCount ?? 0} people x {formatCurrency(Number(entry.wagePerHead ?? 0))}</p>
        <p className="text-sm font-bold text-sky-400">{formatCurrency(total)}</p>
      </div>
    );
  }
  if (type === "material") {
    const rate = Number(entry.quantity ?? 0) > 0 ? Number(entry.cost ?? 0) / Number(entry.quantity) : null;
    return (
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-bold text-slate-100">{entry.materialType ?? "Material"}</p>
          <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-emerald-400">{entry.workStage ?? "No stage"}</span>
        </div>
        <p className="text-xs text-slate-500">{entry.quantity ?? 0} {entry.unit ?? ""}{rate ? ` at ${formatCurrency(rate)} each` : ""}</p>
        <p className="text-sm font-bold text-sky-400">{formatCurrency(Number(entry.cost ?? 0))}</p>
      </div>
    );
  }
  if (type === "machinery") {
    return <p className="font-bold text-slate-100">{entry.equipmentType ?? "Machinery"} • {entry.count ?? 0} units</p>;
  }
  if (type === "expense") {
    return <p className="font-bold text-slate-100">{entry.description ?? "Expense"} • {formatCurrency(Number(entry.amount ?? 0))}</p>;
  }
  return <p className="font-bold text-slate-100">{entry.incidentType ?? "Incident"} • {entry.severity ?? "Low"}</p>;
}
```

- [ ] **Step 4: Run lint**

Run:

```bash
npm run lint
```

Expected: new route and client component compile cleanly.

- [ ] **Step 5: Commit**

```bash
git add app/app/sites/[id]/operations/[type]/page.tsx app/app/sites/[id]/operations/[type]/OperationDetailPageClient.tsx
git commit -m "feat: add operation detail pages"
```

---

### Task 7: Verification Pass

**Files:**
- No planned source edits unless verification finds a defect.

- [ ] **Step 1: Run full unit suite**

Run:

```bash
npm test -- --run
```

Expected: all Vitest tests pass.

- [ ] **Step 2: Run type/lint check**

Run:

```bash
npm run lint
```

Expected: TypeScript passes without errors.

- [ ] **Step 3: Start dev server**

Run:

```bash
npm run dev
```

Expected: Next dev server starts on `http://127.0.0.1:3000`.

- [ ] **Step 4: Manual browser verification**

Open the app and verify:

- Labour form shows `Per Head Salary` as required.
- Material form shows `Work Stage`, `Total Cost`, and a Unit dropdown with unit names.
- Creating a labour log with `10` people and `1000` per head results in a detail row showing `₹10,000`.
- Creating material logs across two work stages shows non-zero stage totals on Material detail.
- Site detail shows operation cards with today's counts and no last-entry previews.
- Each operation detail row shows edit and delete icons.
- Delete asks for confirmation and refreshes the page after success.

- [ ] **Step 5: Commit verification fixes**

If verification required fixes, commit them:

```bash
git add .
git commit -m "fix: polish operation cost logs"
```

If no fixes were required, do not create an empty commit.

---

## Self-Review

- Spec coverage: covered schema, validation, labour salary, material work stage, material total cost, material unit fix, site operation cards, operation detail pages, filtering, sorting, date grouping, material stage totals, and edit/delete row actions.
- Red-flag scan: no open implementation gaps are intentionally left in this plan.
- Type consistency: uses `wagePerHead`, `workStage`, `cost`, and route type values consistently with existing camelCase Drizzle field names and existing entry route type values.
