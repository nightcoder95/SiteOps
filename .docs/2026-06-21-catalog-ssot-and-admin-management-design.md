# Catalog Single-Source-of-Truth & Admin Management — Design

**Date:** 2026-06-21
**Status:** Approved for planning
**Scope:** SiteOps-Web

---

## 1. Problem

Dropdown option data is scattered across **four** disagreeing sources, with data drift in the live one and no admin surface to manage it.

### 1.1 Predefined-data inventory (current)

| # | Dropdown | Source today | Editable |
|---|---|---|---|
| 1 | Labour → Work Type | `subcategories` of "Labour" | live catalog |
| 2 | Materials → Material Type | `subcategories` of "Materials" | live catalog |
| 3 | Equipment → Equipment Type | `subcategories` of "Machinery/Equipment" | live catalog |
| 4 | Material → Unit | `unit_master` (29 rows) + `custom_units` (empty) | separate table |
| 5 | Material → Work Stage | hardcoded in `entryFieldRegistry` + `materialWorkStages` + pg enum `material_work_stage` | code |
| 6 | Expense → Category | hardcoded + pg enum `expense_category` | code |
| 7 | Incident → Type | hardcoded + pg enum `incident_type` | code |
| 8 | Incident → Severity | hardcoded + pg enum `severity` | code |
| 9 | Transfer → work/material type | hardcoded `LABOUR_WORK_TYPES` / `MATERIAL_TYPES` in `TransferForm.tsx` (rogue list) | code |
| — | enum cols on entries, `custom_*` tables, `/api/catalog/*-types` | vestigial / dead | n/a |

### 1.2 Confirmed root causes

- **Logging stores free-text**: `labour_entries.work_type` / `material_entries.material_type` hold the **subcategory name string**. The `selector_mode` / `*Enum` / `*CustomId` columns + `custom_*` tables + `/api/catalog/*-types` routes are inert — read by no client.
- **Unit duplicates** (`UnitSelect.tsx`): no dedupe by display name; `unit_master` has true label dupes (`ton`+`tonne`→"Tonne", `litre`+`l`→"Litre"); `displayUnitName` collapses `bag_50kg`→"Bag" same as `bag`. → "Tonne, Litre, Tonne, Litre" and "Bag, Bag".
- **Labour drift**: 7 junk subcategories (`painting`, `Valuation`, `Mason`, `Helper`, `Fee`, `Other`, `Basement`) added via the generic "Add Subcategory" flow.
- **Material drift**: `Hittachi` (excavator brand, misspelled) + `Other` in Materials.
- **Rogue list**: `TransferForm` uses its own hardcoded type arrays that don't match the catalog.

### 1.3 In-use junk (entries already reference these — cannot blind-delete)

Labour: `painting`(3), `Valuation`(5), `Mason`(2), `Fee`(1), `Helper`(1), `Other`(1), `Basement`(0).
Material: `Hittachi`(1), `Other`(1).

---

## 2. Goals / Non-goals

**Goals**
- One canonical catalog for the **open** option lists (work / material / equipment types + units).
- Admin can view & manage all option lists from one settings page, separated by operation.
- "Add X" CTA on every open dropdown with context-aware label + fuzzy-match suggestion before create.
- Fix data drift (items 1–4) safely, preserving entry history.
- DD/MM/YYYY date display everywhere.

**Non-goals (deferred)**
- Deleting vestigial enum columns / `custom_*` tables / `/api/catalog/*-types` routes (inert; separate cleanup migration to avoid risk this round).

---

## 3. Single source of truth — Model C (Full catalog)

**Every dropdown is a managed catalog list. No code-locked option lists remain.**

**Backbone = `categories` → `subcategories`**, generalized so each list (whether an operation's "type" list or a secondary attribute list) is a category whose items are subcategories. This reuses the existing similarity / duplicate-review / combobox infrastructure for all lists.

### 3.1 Every option list (all admin-editable)

| List | Operation | Source today → after |
|---|---|---|
| Work Type | Labour | subcategories (unchanged) |
| Material Type | Materials | subcategories (unchanged) |
| Equipment Type | Machinery | subcategories (unchanged) |
| Unit | Materials | `unit_master` (kept — has symbol/quantity attrs; surfaced in same UI) |
| Material Work Stage | Materials | pg enum → managed catalog list |
| Expense Category | Expenses | pg enum → managed catalog list |
| Incident Type | Incident | pg enum → managed catalog list |
| Incident Severity | Incident | pg enum → managed catalog list |

**Attribute-list categories**: add new `categories` rows — "Material Work Stage", "Expense Category", "Incident Type", "Incident Severity" — seeded with their current enum values. `categories` gains a `purpose` flag (`operation` vs `attribute`) and an `editable` flag so the settings UI knows how to group/treat them. Units stay in `unit_master` (richer shape) but appear as a list in the same UI.

### 3.2 Enum → managed-list migration

The four pg enums (`material_work_stage`, `expense_category`, `incident_type`, `severity`) currently type columns on entries and back `z.enum(...)` validation.

- **Columns** (`material_entries.work_stage`, `expense_entries.category`, `incident_reports.incident_type`, `incident_reports.severity`) → migrate from pg-enum type to `varchar`, preserving existing values. Mirrors the existing `work_type` free-text pattern.
- **Validation**: replace `z.enum(...)` with a runtime membership check against that list's **active** items (loaded from DB; helper `assertInCatalogList(listKey, value)`). Empty/unknown rejected as today.
- **pg enum types**: left defined but unused on columns (drop deferred with other vestigial cleanup).
- **Logic audit (required task):** find every code branch on these values (severity → alert thresholds, incident type → routing, expense category → grouping). Existing values keep current behavior; admin-added values get safe default handling (no crash, fall through to "other"-style path). Audit + document each branch in the plan.

### 3.3 Schema changes

**`subcategories`** — add:
- `isActive boolean NOT NULL DEFAULT true` — deactivate instead of delete (keeps history selectable-free but visible).
- `sortOrder integer NOT NULL DEFAULT 0` — admin-controlled ordering.
- `remark varchar(500)` — optional note captured on create.

Dropdowns filter `isActive = true`, order by `sortOrder, name`.

**Units folded into the unified surface:**
- Keep `unit_master` as the unit store (richer: code, label, quantity category). Surface it in the settings page + add-CTA pattern alongside the type catalogs. Add `sortOrder` (default 0); `is_active` already exists.
- **Per-material allowed-units becomes data** (replaces hardcoded `KNOWN_RULES` in `materialUnits.ts`): new join table
  ```
  material_type_units (
    id, subcategory_id FK→subcategories, unit_id FK→unit_master.unit_id,
    is_default boolean, unique(subcategory_id, unit_id)
  )
  ```
  - `materialUnitRuleFor(materialType)` reads this table (allowed names = mapped units, preferred = `is_default`).
  - Seeded from current `KNOWN_RULES` so behavior is unchanged on day one.
  - Fallback when a material has no mapping: all active units (not the old "Tonne/Litre" guess).

### 3.3 Consolidation (kill duplicate/rogue sources)

- **TransferForm**: replace `LABOUR_WORK_TYPES` / `MATERIAL_TYPES` with a fetch of the live catalog.
- **`entryFieldRegistry`**: the inline `options` arrays for Work Stage / Expense Category / Incident Type / Severity stop being hardcoded — those fields become `kind: "subcategory"`-style catalog selects loaded from their managed list (with the same Add-CTA). Registry keeps only field structure, not option values.
- **Vestigial system**: mark deprecated in code comments; no deletion this round.

---

## 4. Admin catalog settings page

**Route:** `/app/admin/catalog` (admin-only, behind existing RBAC `site:read_all` / admin guard).

### 4.1 Layout

- Page header "Catalog" + subtitle.
- **Section tabs by operation**: `Labour` · `Materials` · `Equipment` · `Expenses` · `Incident`.
- Each operation tab lists **all its managed lists** as sub-panels, e.g.:
  - Labour → Work Type
  - Materials → Material Type, Unit, Work Stage
  - Machinery → Equipment Type
  - Expenses → Expense Category
  - Incident → Incident Type, Severity
- Each list panel:
  - Table: Name · Sort order · Status (Active/Inactive) · Usage count (entries referencing it) · Actions.
  - Row actions: Rename, Activate/Deactivate, Reorder (up/down or drag); Materials → Material Type also has an "Allowed units" editor.
  - Top-right CTA: context-aware add label — **Add Work Type / Add Material Type / Add Unit / Add Work Stage / Add Equipment Type / Add Expense Category / Add Incident Type / Add Severity** (see §5).
  - Inactive rows muted, with a "Show inactive" toggle (default off).
- **Units panel**: grouped by quantity category (weight/volume/length/…).
- Severity-style lists may expose an extra ordered "rank" hint via `sortOrder` (so Low<Medium<High<Critical ordering is admin-controlled, not value-based).

### 4.2 Data integrity rules

- Deactivate (not delete) anything with `usageCount > 0`. Delete allowed only when `usageCount = 0`.
- Rename updates the subcategory label; existing entries (free-text) are **not** rewritten automatically except via explicit Merge.
- **Merge action** (admin): pick source + target type → rewrite referencing entries' free-text column to target, then delete/deactivate source. Used for the `painting`→`Paint work` cleanup and available ongoing.

---

## 5. Add-CTA pattern (context-aware + fuzzy)

Generalize the existing `SubcategoryCombobox` create flow into a reusable **`CatalogAddModal`**:

- Trigger label is contextual, driven by a prop (not generic "Add Subcategory"): Add Work Type / Material Type / Unit / Work Stage / Equipment Type / Expense Category / Incident Type / Severity.
- As the admin types, debounced call to the similarity endpoint (`/api/forms/subcategories/similar` for catalog lists; new `/api/catalog/units/similar` for units) using existing `rankSimilarityCandidates`.
- Works for every list, including the migrated former-enum lists (work stage, expense category, incident type, severity) since they are now subcategory items.
- If a close match exists, inline suggestion: *"Similar exists: **Litre**. Use it, or create anyway?"* with "Use existing" / "Create anyway" buttons (reuses current 409 `requiresReview` flow + override flag).
- Optional **remark** field (persists to `subcategories.remark` / unit note).
- On create: insert active, `sortOrder` = max+1.

Existing in-form "Add" buttons (in `SubcategoryCombobox`) adopt the contextual label via the same prop.

---

## 6. Data migration (one-time, reviewed)

Drizzle migration + a one-off data script. **All actions confirmed by user:**

**Labour cleanup**
- `painting` → **merge** into `Paint work`: `UPDATE labour_entries SET work_type='Paint work' WHERE work_type='painting'`; delete `painting` subcategory.
- `Basement` (0 uses) → **delete**.
- `Valuation`, `Mason`, `Helper`, `Fee`, `Other` → **deactivate** (`isActive=false`). Entries keep their string.

**Material cleanup**
- Add **`Hitachi`** to Equipment (Machinery/Equipment) catalog, active.
- `Hittachi` in Materials → **deactivate**. The 1 stray material entry retains its `material_type='Hittachi'` string as history (not re-pointed across tables).
- `Other` in Materials → **deactivate**.

**Unit dedup (`unit_master`)**
- Retire `ton` (keep `tonne` → "Tonne"); retire `l` (keep `litre` → "Litre"). Retire = `is_active=false` (rows referenced by entries via FK stay intact).
- Relabel `bag_50kg` display to **"Bag (50 kg)"**; remove the `bag (50 kg)`→"Bag" entry from `DISPLAY_OVERRIDES` so it stays distinct from `bag`→"Bag".
- Seed `material_type_units` from existing `KNOWN_RULES`.

**Code dedupe in `UnitSelect.tsx`**
- Dedupe options by display `name` (keep first) as a defensive guard even after data cleanup.

---

## 7. Date format (item 1)

- New shared util `lib/utils/formatDate.ts`: `formatDate(value): string` → DD/MM/YYYY (and `formatDateTime` for date+time) using a fixed `en-GB`-style numeric format (zero-padded), not locale-dependent.
- Replace scattered `toLocaleDateString("en-IN"|"en-GB")` / inline formatting in: `OperationDetailPageClient.tsx`, `admin/expenses/page.tsx`, `admin/live-feed/page.tsx`, `notifications/page.tsx`.
- Native `<input type="date">` already shows DD/MM/YYYY under the runtime locale; no change needed there, but display surfaces use the util.

---

## 8. UX copy (item 5)

- Replace generic **"Add Subcategory"** with contextual labels everywhere it appears (`SubcategoryCombobox.tsx:207` and the operations/field-request screens): Work Type / Material Type / Equipment Type / Unit / Work Stage / Expense Category / Incident Type / Severity.
- Sweep for other generic copy in the catalog/add flows and align with the operation noun.
- Scope-limited: copy only; no behavioral change beyond the CTA label.

---

## 9. Compatibility matrix

| Existing requirement | Preserved by |
|---|---|
| Logging writes free-text type names | Unchanged; catalog still surfaces names |
| Split-labour (Plastering/Brick work) | `isSplitLabourWorkType` untouched |
| Material unit restriction per type | Now data-driven (`material_type_units`), seeded from `KNOWN_RULES` → same behavior |
| Duplicate-review + admin notify on similar add | Reused (`rankSimilarityCandidates`, fieldRequests) |
| Transfers | Now read live catalog instead of rogue list |
| Former system enums (severity/stage/incident/expense) | Migrated to managed lists; existing values seeded so behavior unchanged; columns now varchar |
| Code branching on severity/incident/etc. values | Audited (§3.2); existing values keep behavior, new values get safe default path |
| Entry history of now-junk values | Preserved (deactivate, free-text retained) |

---

## 10. Testing

- Unit: `formatDate` cases; `UnitSelect` dedupe; `materialUnitRuleFor` reading `material_type_units`; similarity CTA override flow.
- Migration: dry-run counts before/after (`painting`→0, `Paint work` +3; deactivated flags set; unit_master dupes inactive).
- Unit: enum-migration validation (`assertInCatalogList`) accepts seeded values, rejects unknown.
- Migration: dry-run counts before/after (`painting`→0, `Paint work` +3; deactivated flags set; unit_master dupes inactive); former-enum columns hold all pre-existing values after type change.
- E2E (Playwright): admin opens `/app/admin/catalog`, adds a unit with fuzzy collision → sees suggestion; adds a new Work Stage → appears in the material log dropdown; deactivates a type → drops out of log dropdown; date displays DD/MM/YYYY on an operation page.

---

## 11. Out of scope / deferred

- Deletion of vestigial enum columns, `custom_*` tables, `/api/catalog/*-types` routes, and the now-unused pg enum *types* (separate cleanup migration).
- Re-pointing the stray `Hittachi` material entry across tables.
