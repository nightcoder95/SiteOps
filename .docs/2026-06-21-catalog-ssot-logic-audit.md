# Catalog SSOT — Logic Audit (enum→managed, §3.2 / §7 item 2)

**Date:** 2026-06-21
**Question:** does any code branch on the specific values of the four former
enums (`severity`, `incident_type`, `material_work_stage`, `expense_category`)
in a way that breaks when admins add new values?

**Verdict: NO HARD DEPENDENCY.** Existing values keep current behavior; new
admin-added values flow through safely (used as grouping/filter keys or displayed
with a fallback). No alert threshold / routing / escalation is keyed to a
specific value like "Critical".

## Findings per value-set

### severity (`incident_reports.severity`)
- `lib/db/queries/entries.ts:674` — operations filter: `incidentType = $category OR severity = $category`. Value used as a filter term; arbitrary values compare fine.
- `app/.../OperationDetailPageClient.tsx:305` — display `entry.severity ?? "Low"`. Display-only fallback.
- `app/api/entries/incidents/route.ts:48` — `severity: severity ?? "Low"` default on insert.
- **No threshold/escalation** keyed to High/Critical. Incident notification (route :55) fires for every incident regardless of severity.

### incident_type (`incident_reports.incident_type`)
- `entries.ts:674` — same filter term. No routing/branch on Safety vs Block.

### material_work_stage (`material_entries.work_stage`)
- Grouping/dedup keys only: `app/api/entries/materials/route.ts:92` (findMatchingMaterialEntry), `lib/db/queries/operationTotals.ts:55`, `OperationDetailPageClient.tsx:228/508`. All `?? "Other"`-guarded; arbitrary values group correctly.
- Filter eq at `entries.ts:622`.
- TS impact: `MaterialWorkStage` union type (entries.ts:306) used in query signatures → widen to `string`.

### expense_category (`expense_entries.category`)
- No value branch found. Budget alert (`app/api/entries/expenses/route.ts:28-34`) is **threshold-based**, not category-based.

## Consequences for the migration
- Columns → varchar (no behavior change; values preserved).
- `z.enum(...)` → `assertInCatalogList(listKey, value)` runtime membership check against the list's **active** catalog items.
- Widen hand-written TS unions (`incidentType`, `severity`, `MaterialWorkStage`) to `string`.
- Null work_stage still renders/groups as "Other" via existing fallbacks.
