# Context Handoff — Catalog SSOT & Admin Management Implementation

**For:** new implementation session. Read this first, then the design spec.
**Design spec (authoritative):** `.docs/2026-06-21-catalog-ssot-and-admin-management-design.md`
**Date prepared:** 2026-06-21

---

## 0. First moves

1. Read the design spec end-to-end. This handoff summarizes context the spec assumes.
2. Invoke `writing-plans` to break the spec into ordered implementation tasks (brainstorming already done; design approved pending the two open items in §7).
3. Do NOT commit unless the user explicitly asks (their standing rule).

---

## 1. Environment facts

- Working dir: `/Volumes/work/my_projects/SiteOps/SiteOps-Web` (the **git repo is here**, NOT at the `SiteOps/` root — root reports "not a git repo").
- Stack: Next.js 16 (app router, turbopack), React 19, Drizzle ORM + `postgres` driver, Supabase/Postgres, Zod 4, SWR, Tailwind 4, Playwright + Vitest.
- Specs live in `.docs/` (user preference — NOT `docs/superpowers/specs/`).
- Lint = `npm run lint` (tsc noEmit). Tests = `npm test` (vitest). E2E = `npm run test:e2e`.
- DB creds: `DATABASE_URL` in `.env.local` (Supabase pooler). `.env` has a Neon URL — use `.env.local`.

### Querying the live DB (verified working pattern)
Write a `.mts` file **inside `SiteOps-Web/`** (so `node_modules` resolves tsx), then:
```
DOTENV_CONFIG_PATH=.env.local node --import tsx ./yourfile.mts
```
Use `import postgres from 'postgres'; const sql = postgres(process.env.DATABASE_URL!, { prepare: false });`. Top-level await works in `.mts`. Clean up the file after.

---

## 2. The core architecture truth (why this project exists)

Dropdown option data is scattered across **four disagreeing sources**:

1. **`categories` → `subcategories` tables** — LIVE canonical catalog feeding Work/Material/Equipment Type dropdowns.
2. **Free-text columns on entries** (`labour_entries.work_type`, `material_entries.material_type`, etc.) — what logging actually STORES and matches on. Catalog only supplies the string.
3. **Vestigial enum system** — `selector_mode`/`*Enum`/`*CustomId` columns, `custom_labour_types`/`custom_material_types`/`custom_machinery_types` tables (all EMPTY), `/api/catalog/*-types` routes (called by NO client). Dead weight. **Leave alone this round.**
4. **Hardcoded lists** — `TransferForm.tsx` (`LABOUR_WORK_TYPES`, `MATERIAL_TYPES`), and `entryFieldRegistry.ts` inline option arrays for Work Stage / Expense Category / Incident Type / Severity. Plus pg enums backing those.

**Decision (Model C / full SSOT):** make `categories`/`subcategories` the single canonical catalog for EVERY dropdown. Migrate the four pg-enum lists into managed catalog lists. Keep units in `unit_master` (richer shape) but surface in the same UI. Logging keeps writing free-text strings (unchanged pattern).

---

## 3. Locked decisions (do not re-litigate)

- **Model C** chosen: all option lists admin-editable, no code-locked dropdowns.
- **Units folded into the unified settings UI** (kept in `unit_master`, not migrated into subcategories).
- All four former enums (`material_work_stage`, `expense_category`, `incident_type`, `severity`) become managed lists; their entry columns migrate enum→varchar, seeded with current values.
- Vestigial enum/custom_* system + pg enum *types*: deprecate in comments, **defer deletion**.
- TransferForm + entryFieldRegistry option arrays: replace with catalog reads.
- Commit only when user asks.

### Junk data cleanup — exact per-value actions (user-confirmed)
Labour (category "Labour"):
- `painting` (3 entries) → MERGE into `Paint work`: `UPDATE labour_entries SET work_type='Paint work' WHERE work_type='painting'`, then delete `painting` subcategory.
- `Basement` (0 entries) → DELETE.
- `Valuation`(5), `Mason`(2), `Helper`(1), `Fee`(1), `Other`(1) → DEACTIVATE (`isActive=false`). Entries keep their string.

Materials (category "Materials"):
- Add `Hitachi` to Equipment (Machinery/Equipment) catalog, active.
- `Hittachi` (1 entry) → DEACTIVATE in Materials. Stray entry stays as history (not re-pointed).
- `Other` (1 entry) → DEACTIVATE.

Units (`unit_master`, 29 rows — has true dupes):
- Retire `ton` (keep `tonne`→"Tonne"); retire `l` (keep `litre`→"Litre"). Retire = `is_active=false` (FK-referenced rows stay).
- Relabel `bag_50kg` to display "Bag (50 kg)"; REMOVE the `"bag (50 kg)": "Bag"` line from `DISPLAY_OVERRIDES` in `lib/db/queries/materialUnits.ts` so it stops colliding with `bag`→"Bag".
- Add dedupe-by-display-name guard in `UnitSelect.tsx` (defensive, keep first).

---

## 4. Valid values reference (post-cleanup)

- **Labour Work Types (10):** Steel work, Shuttering, Brick work, Concrete work, Plastering, Electric work, Plumbing, Tile work, Wood work, Paint work.
- **Material Types (8):** Cement, M sand, P sand, Metal, Steel, Red Brick, Cement Block 6in, Cement Block 4in.
- **Equipment Types (5 + Hitachi):** Excavator, Concrete Mixer, Crane, Vibrator, Generator, Hitachi.
- **Material Work Stage:** Basement Level, Brick Level, Lintel Level, Roof Level, Compound Wall, Other.
- **Expense Category:** Labour, Materials, Equipment, Misc.
- **Incident Type:** Safety, Block.
- **Severity:** Low, Medium, High, Critical (order via sortOrder).
- **Split-labour work types** (special UI — mason/helper split): Plastering, Brick work — `isSplitLabourWorkType()` in `lib/validation/schemas.ts`. DO NOT break this.

---

## 5. Key files map

| Area | File |
|---|---|
| Schema | `lib/db/schema.ts` (enums ~L20-61, subcategories L374, unit_master L167, entries) |
| Validation | `lib/validation/schemas.ts` (z.enum lists L24/L50/L61, severity/incident L271) |
| Unit logic | `lib/db/queries/materialUnits.ts` (KNOWN_RULES, DISPLAY_OVERRIDES, materialUnitRuleFor) |
| Unit dropdown | `components/logs/UnitSelect.tsx` (no dedupe — bug source) |
| Type dropdown + add flow | `components/logs/SubcategoryCombobox.tsx` ("Add Subcategory" label at L207) |
| Form field registry | `components/logs/entryFieldRegistry.ts` (hardcoded option arrays) |
| Main entry form | `components/logs/EntryForm.tsx` (buildPayload sends free-text) |
| Dynamic form | `components/logs/DynamicEntryForm.tsx` (uses category tree + field_definitions, empty) |
| Subcategory API | `app/api/forms/subcategories/route.ts` (+ `/similar`, `/[id]`) — has fuzzy review flow |
| Category API | `app/api/forms/categories/route.ts` (+ `/similar`, `/[id]`) |
| Units API | `app/api/catalog/units/master/route.ts`, `.../custom/route.ts` |
| Dead routes (ignore) | `app/api/catalog/{labour,material,machinery}-types/route.ts` |
| Similarity engine | `lib/utils/stringSimilarity.ts` (`normalizeLabel`, `rankSimilarityCandidates`) + `lib/services/duplicateGuard.ts` |
| Operations page | `app/app/sites/[id]/operations/[type]/page.tsx` (CATEGORY_NAME_BY_ENTRY_TYPE, hardcoded EXPENSE/INCIDENT options) + `OperationDetailPageClient.tsx` (date formatting L86/94/115) |
| Transfer form | `components/transfers/TransferForm.tsx` (rogue hardcoded lists L25/L38) |
| Entry write paths | `app/api/entries/{labour,materials,machinery,expenses,incidents}/route.ts`, `app/api/entries/[id]/route.ts`, `app/api/transfers/route.ts` |
| Date display also in | `app/app/admin/expenses/page.tsx`, `app/app/admin/live-feed/page.tsx`, `app/app/notifications/page.tsx` |
| Existing infra to reuse | duplicate review → `fieldRequests` table, admin notify via `lib/db/queries/notifications.ts`, cache `lib/cache/invalidate.ts` |

---

## 6. Suggested build sequence (writing-plans will formalize)

1. **Low-risk wins first:** `formatDate` util + replace date displays (item 1); `UnitSelect` dedupe + `DISPLAY_OVERRIDES`/`unit_master` fixes (item 2); TransferForm → catalog read.
2. **Schema:** add `subcategories.isActive/sortOrder/remark`; `unit_master.sortOrder`; `material_type_units` table (if kept — see §7); `categories.purpose/editable`; new attribute-list categories seeded.
3. **Enum→managed migration:** columns enum→varchar (preserve data); seed attribute-list subcategories; swap `z.enum` → `assertInCatalogList`; **logic audit** of every branch on severity/incident/stage/category values.
4. **Data cleanup migration** (§3 actions) — reviewed, dry-run counts.
5. **Add-CTA generalization:** `CatalogAddModal` from `SubcategoryCombobox`, contextual labels everywhere; units `/similar` endpoint.
6. **Admin catalog settings page** `/app/admin/catalog` — tabs per operation, list panels, add/rename/(de)activate/reorder/merge, allowed-units editor.
7. **UX copy sweep** (item 5).
8. Tests (unit + migration dry-run + Playwright per spec §10).

Use TDD per the project's skills. Each migration: verify row counts before/after against live DB.

---

## 7. OPEN ITEMS — confirm with user before/early in implementation

1. **`material_type_units` table** (admin-managed per-material allowed units, replaces hardcoded `KNOWN_RULES`). Currently IN the spec. User has not explicitly confirmed keep vs defer. If deferred: keep `KNOWN_RULES` in code, drop steps referencing the join table, units still get Add CTA + dedup.
2. **Logic audit may find a hard dependency** (e.g., budget/incident alert keyed to "Critical"). If a branch genuinely needs fixed values, flag to user — do NOT silently change behavior. Likely approach: keep the code path keyed to known values, treat admin-added values as a safe default bucket.

---

## 8. Gotchas

- Entries store option values as FREE TEXT, not FKs. Deleting/renaming a catalog item does NOT cascade to entries. Merge = explicit `UPDATE` on the entry column.
- `field_definitions` table is EMPTY → DynamicEntryForm shows no extra fields today; don't assume dynamic fields exist.
- `unit_master.is_active` already exists; `custom_units` is empty.
- pg enum columns can't simply gain values safely; the plan is to convert columns to varchar, NOT `ALTER TYPE ADD VALUE`.
- RBAC: admin guard via `lib/auth/guards.ts` / `lib/auth/capabilities.ts` (`can(role, "site:read_all")`). New settings page is admin-only.
- Caveman mode is active in the user's session (cosmetic; write code/docs normally).
