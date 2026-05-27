# Construction Operation Cost Logs Design

## Context

SiteOps is a construction site logging app for supervisors. The current site detail page shows operation cards with preview rows and filter chips. Labour and material logs need to become cost-aware records so supervisors can understand daily spend and stage-wise material spend.

The app already has typed tables and APIs for labour, material, machinery, expense, and incident entries. This design keeps that architecture and adds first-class fields where reporting depends on them.

## Goals

- Require per-person wage on new labour logs.
- Require construction work stage and total cost on new material logs.
- Fix the material Unit dropdown so it lists units, not material types.
- Replace site detail operation filters with operation summary cards.
- Add typed operation detail pages with date grouping, filtering, sorting, and edit/delete row actions.
- Show construction-cost summaries that are useful to supervisors without turning entry forms into accounting screens.

## Non-Goals

- No global wage catalog in this phase.
- No contractor/vendor invoice management in this phase.
- No budget forecasting or approval workflow changes in this phase.
- No redesign of the whole app shell or navigation.

## Data Model

### Labour Entries

Add `wage_per_head` to `labour_entries`.

- Type: decimal.
- Meaning: per-person per-day wage for this single labour log.
- Required for new labour logs through validation.
- Existing rows may remain nullable to avoid breaking historical data.
- Total labour salary is derived, not stored: `people_count * wage_per_head`.

Rationale: construction labour wages can vary by city, contractor, skill level, overtime, and negotiation. Storing the wage on the log keeps old records historically accurate if wages change later.

### Material Entries

Add `work_stage` and `cost` to `material_entries`.

`work_stage`:
- Label in UI: `Work Stage`.
- Required for new material logs.
- Allowed values:
  - `Basement Level`
  - `Brick Level`
  - `Lintel Level`
  - `Roof Level`
  - `Compound Wall`
  - `Other`

`cost`:
- Label in UI: `Total Cost`.
- Type: decimal.
- Meaning: total amount spent for that material entry.
- Required for new material logs.
- Unit rate is derived for display when useful: `cost / quantity`, only when quantity is positive.

Rationale: the requested material reports ask for amount spent by stage. Total entry cost directly supports that. Unit price is secondary and can be derived.

## Entry Forms

### Labour Form

Add a mandatory number field:
- Label: `Per Head Salary`
- Field: `wagePerHead`
- Minimum: greater than 0.
- Currency display in summaries should use Indian rupee formatting.

Submission payload includes `wagePerHead`. Server validation rejects missing, zero, negative, or non-numeric values for new entries.

### Material Form

Add mandatory fields:
- `Work Stage`: dropdown with the fixed allowed values.
- `Total Cost`: number field, greater than 0.

Fix the existing Unit field:
- It must load actual units from `unit_master` and custom units.
- It must not use material subcategories.
- The UI should still follow the existing dark form style and controlled React input pattern.

Submission payload includes `workStage` and `cost`. Server validation rejects missing or invalid values for new entries.

## Site Detail Page

Remove the operation filter chips:
- `All`
- `Labour`
- `Material`
- `Machinery`
- `Expense`
- `Incident`

Replace the current operation preview behavior with a fixed grid of operation summary cards:
- Labour
- Material
- Machinery
- Expense
- Incident

Each card shows:
- Operation badge and icon.
- Total entries for today only.
- For Labour: today's total labour spend when wage data exists.
- For Material: today's total material spend when cost data exists.
- CTA text: `Click for details`.
- No last-entry preview.

Clicking a card routes to:

```text
/app/sites/[siteId]/operations/[type]
```

The summary counts and spend should come from an accurate summary query or API response, not from the current preview arrays. The current grouped `all` response is capped for preview use and should not be used as the source of truth for counts once logs grow.

## Operation Detail Pages

Create typed operation detail pages at:

```text
/app/sites/[siteId]/operations/[type]
```

Supported types:
- `labour`
- `material`
- `machinery`
- `expense`
- `incident`

Shared layout:
- Header with site name and operation type.
- Summary metrics:
  - Total logs in current filter.
  - Total spend for cost-bearing types.
- Filter bar:
  - Single date.
  - From date.
  - To date.
  - Category filter.
- Sort control:
  - Newest first.
  - Oldest first.
  - Highest spend first for cost-bearing types.
  - Lowest spend first for cost-bearing types.
- Logs grouped by date.
- Each date group shows daily totals where applicable.
- Every row includes edit and delete icon actions.

### Labour Detail

Category filter:
- Work Type.

Each row shows:
- Work type.
- People count.
- Per head salary.
- Calculated total salary.
- Remarks when present.
- Edit icon.
- Delete icon.

Daily group total:
- Sum of `people_count * wage_per_head`.

Spend sorting:
- Uses calculated total salary.
- Supervisors can identify highest-spend and lowest-spend dates through date group totals and spend sort.

### Material Detail

Category filters:
- Material Type.
- Work Stage.

Each row shows:
- Material type.
- Quantity.
- Unit.
- Work Stage tag.
- Total Cost.
- Derived unit rate when quantity is positive.
- Remarks when present.
- Edit icon.
- Delete icon.

Daily group total:
- Sum of material `cost`.

Stage summary:
- Show amount spent by Work Stage at the top of the page for the active filter range.
- Include all configured stages, showing zero where there is no spend.

### Machinery, Expense, And Incident Detail

These pages use the same detail-page shell and row action pattern.

Category filters:
- Machinery: equipment type.
- Expense: expense category.
- Incident: incident type and severity.

Spend sorting:
- Expense can use amount.
- Machinery and Incident do not get spend sorting unless cost fields are added later.

## Row Actions

Every operation detail row includes:
- Edit icon.
- Delete icon.

Behavior:
- Edit links to the existing edit flow for that typed entry.
- Delete asks for confirmation before deletion.
- Delete uses the existing typed entry delete API.
- Actions follow existing ownership and role rules.
- Icons use the app's existing Lucide icon style, with visible hover and focus states.

## API And Query Design

Add or extend server-side queries to support:
- Site operation summary for today:
  - Count by operation type.
  - Labour spend for today.
  - Material spend for today.
- Operation detail fetch:
  - Type.
  - Date or date range.
  - Category filters.
  - Sort mode.
  - Reasonable pagination or limit behavior.
- Material stage spend summary for the active filter set.

Existing endpoint candidates:
- Extend `/api/sites/[id]/entries` for detail filters and sort.
- Add a focused summary endpoint for site detail operation cards.

Preferred design:
- Keep `/api/sites/[id]/entries` for detail lists.
- Add a focused summary query/API for site detail cards so summary counts are accurate and independent from preview limits.

## UI And UX Direction

Follow the current frontend architecture and visual system:
- Dark OLED-style surface.
- Compact operational dashboard layout.
- Existing `card-standard`, `btn-primary`, `input-standard`, and app shell conventions.
- Lucide icons for interactive actions.
- Controlled React form fields.
- Clear hover/focus states.
- Responsive layouts at mobile and desktop widths.

Avoid:
- Marketing-style hero sections.
- Decorative cards inside cards.
- Long explanatory in-app text.
- Hidden row actions that supervisors cannot discover.
- Overloading forms with accounting concepts beyond the required cost fields.

## Testing And Verification

Add or update tests for:
- Labour validation requiring `wagePerHead`.
- Material validation requiring `workStage` and `cost`.
- Labour total salary calculation.
- Material unit-rate calculation for display helpers, including divide-by-zero protection.
- Material Work Stage allowed values.
- Site summary query counts today's entries correctly.
- Site summary query computes Labour and Material spend correctly.
- Detail filter and sort behavior where existing test patterns support it.

Manual verification:
- Create a labour log with 10 people and `1000` per head; detail page shows `10000`.
- Create material logs across at least two Work Stages; material detail shows stage totals.
- Confirm Material Unit dropdown lists units, not material types.
- Confirm Site Detail cards show today's counts and no last-entry preview.
- Confirm edit and delete icons appear on every operation detail row.
