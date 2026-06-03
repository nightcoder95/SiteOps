# Operation Consolidation And Budget Tracking Design

## Context

SiteOps is a construction site logging app built with Next.js App Router, React client components, Drizzle ORM, PostgreSQL, Zod, Vitest, and the existing dark SiteOps UI system.

The current operation detail pages already support typed operation views for labour, material, machinery, expense, and incident. They group rows by date, compute daily totals, and render filter controls. The current typed entry model supports cost-aware labour, material, and expense entries. Machinery does not yet have a cost field. The site detail page currently shows only the agreed site budget, not current tracked spend.

The requested fixes change both UI and write behavior. Same-day same-category logs must become one durable entry inside each operation type, not just a grouped visual presentation.

## Goals

- Consolidate same-day same-category entries within each operation type at write time.
- Add a clear label to daily totals on operation detail pages.
- Show a category running total on each operation card.
- Align operation filter controls and add a clear filter action.
- Add Mason and Helper sections for Plastering and Brickwork labour entries.
- Restrict material units based on selected material type and add the requested material types.
- Add machinery cost tracking so machinery contributes to budget usage.
- Show current tracked spend against agreed budget on the site detail page.

## Non-Goals

- No broad redesign of the app shell or navigation.
- No invoice, vendor, or payment workflow.
- No global salary catalog.
- No database cleanup tool for existing duplicates in this phase.
- No budget forecasting beyond current tracked spend versus agreed budget.

## Decisions

Use API-level write-time consolidation.

When a create request matches an existing same-site, same-day entry in the same operation type and same operation-specific category key, the API updates the existing row by summing numeric values instead of inserting another row.

This keeps the user-facing behavior aligned with the requirement: one category entry per day per operation. It also avoids confusing edit/delete behavior from visual-only grouping.

Database unique constraints are deferred. They are useful later, but API-level consolidation is safer for this phase because existing data may already contain duplicates and each operation type has a different merge key.

## Consolidation Rules

All consolidation is scoped inside one operation type. Labour never consolidates with Expense, Material never consolidates with Machinery, and so on.

### Labour

Merge key:

```text
siteId + date + workType
```

For ordinary labour work types, merge by summing:

- `peopleCount`
- submitted salary amount

For Plastering and Brickwork variants, store two internal role sections:

- Mason count
- Mason salary amount
- Helper count
- Helper salary amount

Recognized split-work names:

- `Plastering`
- `Brick work`
- `Brickwork`

When a matching labour row exists, merge by summing counts and salary amounts. Do not compute or display effective rates. The UI shows role totals where available and always shows the combined salary total.

### Material

Merge key:

```text
siteId + date + materialType + workStage
```

Merge by summing:

- `quantity`
- `cost`

The material unit is controlled by material type. If a material type and work stage match, the entry consolidates even if a submitted unit label differs. The server should normalize the unit from the material type rule before writing.

### Machinery

Merge key:

```text
siteId + date + equipmentType
```

Add required machinery `totalCost`.

Merge by summing:

- `count`
- `hoursActive`
- `totalCost`

### Expense

Merge key:

```text
siteId + date + category
```

Merge by summing:

- `amount`

The current expense model has no remarks field. If a later entry has a non-empty description, keep the existing description unless it is empty, then use the new description. This avoids silently concatenating unstructured descriptions into one field.

### Incident

Incident entries are not consolidated in this phase. They do not represent spend and can describe separate events even when incident type matches.

## Data Model Changes

### Labour Entries

Add nullable fields to support role split labour logs while preserving historical rows:

- `salary_amount`
- `mason_count`
- `mason_salary_amount`
- `helper_count`
- `helper_salary_amount`

Existing fields remain for ordinary labour rows:

- `people_count`
- `wage_per_head`

For new ordinary rows, `salary_amount` is the source of truth for the labour total. It is initialized from the submitted `people_count * wage_per_head`, then merged by addition on later same-day same-work-type submissions.

For split-work rows, the split fields are the source of truth for totals:

```text
mason_salary_amount + helper_salary_amount
```

For historical ordinary rows where `salary_amount` is null, fall back to the existing derived total:

```text
people_count * wage_per_head
```

### Machinery Entries

Add nullable `total_cost` to `machinery_entries`.

It is required by validation for new machinery logs after this change. Historical rows may remain null.

### Material Catalog

Add default material types:

- `Steel`
- `Red Brick`
- `Cement Block 6in`
- `Cement Block 4in`

Existing default material types remain:

- `Cement`
- `M sand`
- `P sand`
- `Metal`

### Unit Catalog And Material Unit Rules

The current DB unit catalog contains many master units, including Nos, Pair, Set, Bag (50 kg), Packet, Kilogram, Tonne, Litre, Kilolitre, Cubic Meter, Square Foot, Square Meter, Running Foot, Meter, Trip, Hour, and Day.

The material entry flow must expose only the requested units:

- Cement -> `Bag`
- M sand -> `CFT`
- P sand -> `CFT`
- Metal -> `CFT`
- Steel -> `KG`
- Red Brick -> `Numbers`
- Cement Block 6in -> `Numbers`
- Cement Block 4in -> `Numbers`
- Other/custom materials -> `Tonne`, `Litre`

Implementation can map existing master rows where practical:

- `Bag` can use existing Bag (50 kg) internally while displaying `Bag`.
- `KG` can use existing Kilogram internally while displaying `KG`.
- `Numbers` can use existing Nos internally while displaying `Numbers`.

Add or seed `CFT` if it is not present in `unit_master`. The server must enforce the same unit rule used by the UI.

## Entry Form Design

### Labour Form

The labour form watches the selected Work Type.

For `Plastering`, `Brick work`, or `Brickwork`, replace the current People Count and Per Head Salary area with two role sections:

- Mason
  - Count
  - Salary amount
- Helper
  - Count
  - Salary amount

Desktop layout can place Mason and Helper side by side. Mobile layout stacks them. Each section should use the existing `input-standard` style and compact operational labels.

For all other work types, keep the existing People Count and Per Head Salary fields.

On submit, ordinary labour rows also send or derive a total salary amount from `peopleCount * wagePerHead`. Consolidation sums that amount and does not recalculate an effective rate for display.

### Material Form

The Unit dropdown becomes material-aware.

After Material Type is selected:

- Show the single mapped unit for known material defaults.
- Show only Tonne and Litre for custom or unknown material types.
- Clear any previously selected unit if it becomes invalid for the selected material.

### Machinery Form

Add required `Total Cost`.

Validation rejects missing, zero, negative, or invalid total cost for new machinery entries.

## Operation Detail UI

### Daily Total Label

Date group headers should label the total explicitly:

```text
30/5/2026    Day total ₹12,600
```

This replaces the current bare amount beside the date.

### Consolidated Cards

Because new writes consolidate at API level, the operation detail page should normally receive one row per category key per day.

For existing duplicate rows already in the database, the UI can defensively group rows by the same operation-specific merge key so the page remains clean before data cleanup.

Grouped legacy duplicates should show one visual card with the summed totals. If edit/delete actions are ambiguous for grouped legacy rows, expose actions only when the visual card maps to one underlying row.

### Running Total

Each cost-bearing card shows a running category total.

Label:

```text
Running total
```

Meaning: total tracked spend for that same operation category from the beginning of the active list up to that card.

Examples:

- Labour: Plastering running total up to this point.
- Material: Cement at Brick Level running total up to this point.
- Machinery: JCB running total up to this point.
- Expense: Labour expense-category running total up to this point.

The running total respects the active filter range and sort direction. When sorted newest first, compute running totals in chronological order and display the resulting value on each visible card.

### Filters

Make all operation detail filter controls visually consistent:

- Shared fixed height, based on `input-standard` plus `h-14`.
- Equal-width desktop grid columns.
- Full-width stacked controls on mobile.
- Date filter buttons match select/input height.

Add `Clear Filters` as a secondary action:

- Resets `from`
- Resets `to`
- Resets `category`
- Resets `workStage`
- Resets sort to `newest`
- Navigates back to the base operation detail URL

Keep `Apply Filters` as the primary action.

## Site Detail Budget Tracking

The site detail budget stat changes from agreed budget only to current tracked spend over agreed budget:

```text
₹42,500 / ₹1,00,000
```

Current tracked spend includes:

- Labour total
- Material cost
- Machinery total cost
- Expense amount

Incidents are excluded.

The existing project progress bar remains project progress. Do not repurpose it as budget progress in this phase. A small budget usage percent can be shown under the budget value if it fits the current stat layout.

The existing budget-alert helper currently sums only expense entries. Update the budget aggregate helper so alert logic and the site detail budget value use the same spend definition.

## API And Query Design

Add query helpers that:

- Find existing same-day rows by operation-specific merge key.
- Merge create payloads into existing rows.
- Calculate operation totals consistently.
- Calculate site tracked spend across Labour, Material, Machinery, and Expense.

The typed create endpoints remain the write entrypoints:

- `POST /api/entries/labour`
- `POST /api/entries/materials`
- `POST /api/entries/machinery`
- `POST /api/entries/expenses`

Each endpoint should:

1. Validate payload.
2. Check site ownership.
3. Normalize any material unit rule.
4. Look for an existing same-day same-category row.
5. Update and return the existing row when found.
6. Insert and return a new row when none exists.

Return status can remain `201` for new inserts and use `200` for merged updates. The response should be the persisted row.

## Error Handling

- If material unit and material type conflict, server validation should reject or normalize before writing. Prefer normalize for known material rules, reject only when required fields are missing.
- If a split labour work type has no Mason and no Helper values, reject the payload.
- If a normal labour work type lacks people count or wage, reject the payload.
- If machinery total cost is missing for a new machinery log, reject the payload.
- If a consolidated update fails, return the existing API error format through current response helpers.

## Testing Plan

Add focused tests for pure helpers and validation first, then API/query behavior where practical.

Required tests:

- Labour split total calculation:
  - Mason and Helper totals are summed separately.
  - Combined total is Mason salary amount plus Helper salary amount.
- Labour consolidation key:
  - Same site/date/workType merges.
  - Different workType does not merge.
- Material consolidation key:
  - Same site/date/materialType/workStage merges.
  - Same material but different workStage does not merge.
- Machinery consolidation key:
  - Same site/date/equipmentType merges.
  - `totalCost` is included in spend.
- Expense consolidation key:
  - Same site/date/category merges.
- Material unit rules:
  - Cement resolves to Bag.
  - M sand/P sand/Metal resolve to CFT.
  - Steel resolves to KG.
  - Red Brick and Cement Blocks resolve to Numbers.
  - Custom material allows only Tonne and Litre.
- Budget aggregate:
  - Includes Labour, Material, Machinery, and Expense.
  - Excludes Incident.
- Field registry:
  - Labour supports split fields for Plastering/Brickwork behavior.
  - Machinery includes Total Cost.
- Operation detail UI:
  - Date header includes `Day total`.
  - Clear Filters resets the URL.

Manual checks:

- Mobile labour edit/create form for Plastering shows Mason and Helper sections without overlap.
- Desktop operation filters have equal visual height and aligned widths.
- Operation detail cards show `Running total`.
- Site detail page shows current/agreed budget.
- Material Unit dropdown changes after material selection.

## Open Implementation Notes

- Existing duplicate rows may remain in the database. New writes will consolidate, and the UI should defensively group visible legacy duplicates.
- If existing split-work labour rows only have `people_count` and `wage_per_head`, treat them as ordinary rows until edited.
- Migration should be backward-compatible and avoid making new columns non-null immediately.
- UI copy should use concise operational labels: `Day total`, `Running total`, `Mason`, `Helper`, `Total Cost`.
