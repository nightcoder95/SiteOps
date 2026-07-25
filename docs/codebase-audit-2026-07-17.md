# SiteOps-Web Codebase Audit — 2026-07-17

**Scope:** full codebase (`app/`, `components/`, `lib/`) — duplicated logic, dead code, performance bottlenecks, overly complex modules, and UI/UX.
**Method:** four parallel read-only exploration passes (duplication + dead code, architecture depth, performance, UI/UX), synthesized here. **No code was changed.**
**Vocabulary:** *module* = anything with an interface + implementation; *deep* = lots of behaviour behind a small interface; *shallow* = interface nearly as complex as implementation; *seam* = a place behaviour can be altered without editing the implementation; *locality* = change/bugs concentrated in one place.

---

## Executive summary

The codebase is in better shape than a typical audit finds: the server/DB layer is genuinely well-tuned (thorough indexes, zero-round-trip JWT auth, singleton DB client, single-round-trip SQL summaries), error surfacing is centralized behind `lib/ui/toast.ts`, and double-submit protection exists everywhere. The problems that remain cluster around **one architectural root cause** and a handful of concrete hotspots:

1. **The "entry type" concept (labour / material / machinery / expense / incident) is not a module.** Its knowledge — fields, columns, spend formula, endpoints, validation, rendering — is re-encoded independently in **~11 files**. This one issue generates most of the duplication findings and most of the complexity findings. Fixing it (an `EntryTypeDescriptor` registry) retires the largest amount of friction in one move.
2. **Three UI defects directly hurt field supervisors** on mobile: swallowed form-validation messages, native `window.confirm`/`prompt` dialogs (unreliable in installed PWAs), and missing `inputMode` on every numeric input.
3. **One real performance hotspot scales with total data volume:** the uncached full-table catalog usage aggregate, refetched after every catalog mutation.

Everything below is ranked. P0 = user-facing defects and drift-prone duplication; P1 = the big architectural consolidation; P2 = performance and consistency; P3 = cleanup.

### Priority matrix

| # | Finding | Area | Priority |
|---|---------|------|----------|
| F1 | EntryForm swallows validation messages | UI/UX | **P0** |
| F2 | Native `window.confirm`/`window.prompt` in installed-PWA flows | UI/UX | **P0** |
| F3 | No `inputMode` on any numeric input | UI/UX | **P0** |
| F4 | Material unit-resolution duplicated and **already drifted** between create and update routes | Duplication | **P0** |
| F5 | TransferForm requires hand-typed UUID | UI/UX | **P0** |
| F6 | Uncached full-table catalog aggregate + refetch after every mutation | Performance | **P1** |
| F7 | Entry-type knowledge spread across ~11 files → `EntryTypeDescriptor` registry | Architecture | **P1** |
| F8 | Entry POST route preamble copy-pasted ×4; auth guard repeated in 58 routes | Duplication | **P1** |
| F9 | `lib/db/queries/entries.ts` per-type switches (~215 collapsible lines) | Duplication/Complexity | **P1** |
| F10 | Labour-spend formula encoded 4 independent times | Duplication | **P1** |
| F11 | categories/subcategories route pairs are ~150-line twins | Duplication | **P2** |
| F12 | Approvals page tangles 3 approval domains in one 337-line component | Complexity | **P2** |
| F13 | Client components import from `lib/db/queries/*` (seam leak) | Architecture | **P2** |
| F14 | Rate-limit Upstash round-trip on every request incl. cheap GETs | Performance | **P2** |
| F15 | "All operations" pulls up to 1000 unprojected rows; `router.refresh()` after optimistic delete | Performance | **P2** |
| F16 | 9 pages are full `'use client'` with post-hydration fetch waterfalls | Performance | **P2** |
| F17 | Placeholder contrast ~3:1; 9–10px labels for outdoor mobile users | UI/UX | **P2** |
| F18 | Field metadata duplicated between registry and zod schemas | Architecture | **P2** |
| F19 | Dead code: stale `lib/db/migrations/schema.ts` + `relations.ts`, `mergeVisualEntries`, `entryCategoryKey`, `catalogNounForCategory` | Dead code | **P3** |
| F20 | Mixed icon systems; unassociated form labels; ~36px header touch targets; keystroke-level similarity POST; ad-hoc z-index; hand-rolled popovers; layout-jumping loaders; approvals theming divergence | UI/UX | **P3** |

---

## P0 — user-facing defects & drifted duplication (fix first)

### F1. EntryForm discards its own validation messages (critical UX)
**Files:** `components/logs/EntryForm.tsx:228-232` (also `:142-165`)

`validate()` returns precise strings like `"Work Type is required"` and `"Mason or Helper values are required"`, but the submit handler throws them away:

```ts
const err = validate();
if (err) { notifyGenericError(); return; }
```

The user sees a generic "Something went wrong" toast on a 482-line multi-field form, with no inline error near any field. A supervisor who misses one field has no way to know which.

**Fix:** pass the message through — `notifyError(err)` at minimum. Better: store per-field errors in state and render them inline under the offending `FieldRow` (the `FieldRow` abstraction at `:378-436` already has the structure to carry an error slot). Effort: small.

### F2. Native `window.confirm` / `window.prompt` for destructive actions
**Files:** `components/logs/EntryForm.tsx:261`, `components/logs/CategoryPicker.tsx:138`, `components/logs/SubcategoryCombobox.tsx:154`, `components/tools/ToolCatalogManager.tsx:91,96`, `components/tools/ToolCategoryManager.tsx:47` (a `window.prompt` rename!)

A branded, accessible `confirmDialog()` already exists (`lib/ui/confirm.tsx` — focus management, Escape, scroll lock, safe-area, `z-[1000]`) and is used by the entry lists. These five call sites bypass it. Native dialogs are unstyled, ignore safe-area, and are unreliable inside installed PWAs (some engines suppress them silently — the destructive action then never confirms). `window.prompt` for rename is unusable on mobile.

**Fix:** replace all five with `confirmDialog()`; replace the `window.prompt` rename with a small `ModalShell` form. Effort: small, mechanical.

### F3. Zero `inputMode` usage repo-wide on numeric inputs
**Files:** `components/logs/EntryForm.tsx:425-436, 457-476` (wages, quantities, split-labour counts), `components/transfers/TransferForm.tsx:226`, and every other `type="number"` input.

`type="number"` alone gives inconsistent mobile keyboards. Field supervisors entering wages/quantities get the wrong or full keyboard on every entry.

**Fix:** add `inputMode="decimal"` for money/quantity fields and `inputMode="numeric"` for counts. If the field registry gains a `numericKind` property (see F7), this becomes one change in one renderer. Effort: small.

### F4. Material unit-resolution: duplicated **and already behaviourally drifted**
**Files:** `app/api/entries/materials/route.ts:66-97` vs `app/api/entries/[id]/route.ts:163-203`

Both re-implement the same ~30–40 line algorithm (load `materialUnitRuleFor(materialType)` → fetch active units → derive submitted name → resolve → error `"${materialType} must use ${allowedNames.join(" or ")} as the unit"`). They have **diverged**: the create route returns 400 when the unit can't be resolved; the update route silently falls back to `unitRule.preferredName`. That means an entry can be created under strict rules and edited into a state creation would have rejected.

**Fix:** extract a pure `resolveMaterialUnit(rule, submitted, activeUnits): Result` into `lib/services/entries.ts` (alongside the already-well-factored `evaluateLabourSplit` and `coerceDecimals`), unit-test it, and decide **one** fallback behaviour. Both routes shrink to a call. This is the highest-value single extraction in the codebase because the drift is a live correctness risk, not just duplication. Effort: small-medium.

### F5. TransferForm makes the user hand-type a raw UUID
**File:** `components/transfers/TransferForm.tsx:217-219`

```jsx
<label>Unit ID</label>
<input value={unitCustomId} placeholder="Unit UUID" required />
```

A field supervisor cannot type a UUID on a phone; material transfers are effectively unusable from mobile.

**Fix:** replace with a picker in the style of `UnitSelect` (searchable list resolving to the ID behind the scenes). Effort: medium.

---

## P1 — the architectural consolidation & top performance hotspot

### F6. `/api/admin/catalog` runs an uncached full-table aggregate over ALL entry tables — and the client refetches it after every mutation
**Files:** `app/api/admin/catalog/route.ts:18-35`, `lib/catalog/overviewQuery.ts:21-25`, `components/catalog/CatalogManager.tsx:112,129-149,148,166,199`

`fetchUsageCounts` UNION-ALLs `count(*) GROUP BY <col>` across all 7 `USAGE_SOURCES` — full sequential scans with **no** `site_id` filter, over columns (`work_type`, `material_type`, …) that are the only unindexed WHERE/GROUP columns in the schema. No `getOrSetJson` caching, although the sibling `admin/analytics` route caches. `CatalogManager` then calls `mutate()` (full refetch) after **every** toggle/rename/merge/create, and a drag-reorder fires **two sequential PATCHes** plus the refetch. Cost grows linearly with total entries across all sites — the only remaining server hotspot that scales with data volume.

**Fix (in order of payoff):**
1. Wrap the route in `getOrSetJson` with a 30–60s TTL (mirror `admin/analytics/route.ts:32-36`), invalidated on catalog writes.
2. Update reordered/renamed rows optimistically client-side instead of full `mutate()`.
3. Batch the two reorder PATCHes into one request.
4. If the aggregate stays hot after caching, add indexes on the grouped columns.
Effort: medium.

### F7. Make "entry type" a real module: the `EntryTypeDescriptor` registry
**Root cause behind F8, F9, F10, and half of the P2 list.** The knowledge of what each entry type *is* lives in ~11 parallel encodings:

| Concern | Location | Shape |
|---|---|---|
| DB read/write/delete | `lib/db/queries/entries.ts:319,381,427,679` | 4 separate `switch(type)` |
| Spend SQL | `lib/db/queries/entries.ts:517-542` | per-table CASE |
| Form fields + endpoints | `components/logs/entryFieldRegistry.ts:38,157` | REGISTRY + endpoint switch |
| Display (id/date/spend/summary/categoryKey) | `components/operations/entryFormat.tsx:81-288` | **7** `if type===` chains |
| Colours/labels/icons | `components/operations/typeStyles.ts:5,22`, `components/constants/EntryTypeIcon.tsx` | 3 maps |
| Edit-form mapping | `components/logs/mapEntryToFormValues.ts:44,72,104-110` | switch + map |
| Decimal columns | `lib/services/decimals.ts:7` | record |
| Validation | `lib/validation/schemas.ts` | 5 create + 5 update schemas |
| Route dispatch | `app/api/entries/[id]/route.ts:49,94-105,120-127` | guard + ternary + switch |
| Search sources | `components/search/GlobalSearchOverlay.tsx:17` | list |

A single conceptual change ("materials now track a supplier") has no home — it fans out across DB layer, validation, registry, formatter, and route. The existing `entryFieldRegistry.ts` proves the data-driven pattern works, but only covers form fields.

**Fix:** one descriptor per type (`lib/entryTypes/<type>.ts`) implementing a shared interface roughly:

```ts
interface EntryTypeDescriptor {
  table; idColumn; dateColumn;        // collapses entries.ts switches (F9)
  decimalFields;                       // absorbs decimals.ts
  spendExpr; spendOf(entry);           // one home for the labour formula (F10)
  formFields; endpoint;                // absorbs entryFieldRegistry
  zodCreate; zodUpdate; catalogFields; // collapses [id]/route.ts dispatch
  renderSummary(entry); label; icon;   // collapses entryFormat.tsx chains
}
```

Callers do `getDescriptor(type)` lookups/loops instead of switching. This passes the deletion test hard: the concept is genuinely reused by N callers, so concentrating it buys both leverage (tiny interface) and locality (one file per type). **Migrate incrementally** — start with `table`/`idColumn` (F9), then spend (F10), then display, then validation. Effort: large but decomposable; each step ships independently.

### F8. Entry POST route preamble copy-pasted ×4; auth guard repeated in 58 routes
**Files:** `app/api/entries/{labour,machinery,materials,expenses}/route.ts` (labour L15-63, machinery L15-53, materials L22-63, expenses L35-77) — ~120 duplicated lines. The site-lookup + archived-check + ownership block is verbatim ×4. The identical 3-line `if (!("session" in auth)) return errorResponse(...)` guard appears in **58** route files.

**Fix:** two helpers —
- `assertSiteWritable(request, siteId)` → returns `{site, session}` or an error response (kills the ×4 block);
- fold the auth guard into a `withAuthedApi` wrapper around the existing `withApi` so handlers receive a guaranteed session.
Also extract the shared success tail (insert → `runNonCritical(analytics invalidation)` → `successResponse` → `handleDbError`). Effort: medium; high payoff for every future route.

### F9. `lib/db/queries/entries.ts` (710 lines): three near-identical 5-case switches + five clone fetchers
**Files:** `lib/db/queries/entries.ts:319-359, 381-425, 427-467` (get/update/delete — same `(type → table, PK column)` facts restated three times, ~150 lines), `:593-663` (`fetchLabour/Material/Machinery/Expense` structurally identical, ~70 lines), plus 5 `insert*` (L28-132), 4 `findMatching*` (L134-194), 4 `merge*` (L200-300) per-type clones.

Reads deep (`getEntryById(id, type)` is a nice interface) but the body is mechanical dispatch with zero locality. **Keep** `getEntriesBySite`'s real logic (date-window handling, incident `created_at::date` special case at `:585`, spend-sort, preview caps) and `siteOperationSummary` — those earn their keep.

**Fix:** `TABLE_BY_TYPE` / `ID_COL_BY_TYPE` lookup maps (step 1 of F7) reduce ~215 lines to ~30. Effort: medium; mostly mechanical, existing tests cover it.

### F10. Labour-spend formula encoded 4 independent times
**Files:** `components/operations/entryFormat.tsx:104-110`, `app/api/entries/labour/route.ts:37-42`, `lib/db/queries/entries.ts:517-522` (SQL), `calculateLabourTotal` (referenced `entries.ts:12`)

The "mason+helper split → stored salaryAmount → peopleCount×wagePerHead" business rule exists in four places (TS ×3 + SQL ×1). Any change to labour costing must find all four or totals silently disagree between list views, summaries, and stored values.

**Fix:** one `labourSpend(entry)` in `lib/services/entries.ts` used by route + formatter; keep the SQL version but add a test asserting SQL and TS agree on fixture rows. Folds into the F7 descriptor's `spendOf`. Effort: small.

---

## P2 — structural & performance cleanups

### F11. `categories` / `subcategories` route pairs are ~150-line structural twins
**Files:** `app/api/forms/categories/route.ts` vs `app/api/forms/subcategories/route.ts` (+ `[id]` and `similar` variants)
- `resolveReviewSiteId` is **byte-for-byte identical** (categories L24-50, subcategories L33-59).
- The "requiresReview → notify admins + insert fieldRequests row" and "customFields/remarks → fieldRequests rows" blocks are the same logic with different noun strings (L139-206 / L136-203).
- `similar/route.ts` pair differs only in table + one schema field.

**Fix:** shared `lib/catalog/review.ts` (`resolveReviewSiteId`, `submitForReview(kind, ...)`) parameterized by a small `{table, noun, extraFields}` config. Effort: medium.

### F12. Approvals page: three approval domains tangled in one component
**File:** `app/app/admin/approvals/page.tsx` (337 lines) — 9 `useState` + 9 raw `requestJson` + 4 `useOptimistic` (L47-70) managing resource-requests, field-requests, transfers, and category approvals in one function. Hand-rolls fetch state instead of the app-standard `useApiResult` (`lib/http/useApiQuery.ts`). A bug in transfer approval lives in the same closure as category-merge state — no locality.

**Fix:** split into `<ResourceRequests/>`, `<FieldRequests/>`, `<TransferApprovals/>`, each with one `useApiResult` + one mutation helper; page becomes a layout shell. Also fixes its theming/touch-target divergence (F20). Effort: medium.

### F13. Seam leak: client components import from `lib/db/queries/*`
**Files:** `components/operations/entryFormat.tsx:1-2`, `components/logs/EntryForm.tsx:10`, `EntryLogList.tsx:12`, `UnitSelect.tsx:5` (imports **runtime** helpers `dedupeUnitOptionsByName`, `displayUnitName` from `lib/db/queries/materialUnits`), `SiteDetailPageClient.tsx:29`, + 2 operation page clients.

`EntryType` / `MaterialWorkStage` are declared inside the DB query module (`entries.ts:302,310`), so the client bundle's type graph roots in the Drizzle layer; `UnitSelect` pulling runtime functions from a "db/queries" module is the sharpest leak.

**Fix:** move the enums/type vocabulary to `lib/types/entry.ts` (already exists, holds row types) and the pure unit helpers next to `lib/catalog/units.ts`; DB modules import *downward* into them. Effort: small-medium, mostly import churn.

### F14. Rate-limit adds an Upstash REST round-trip to every API request
**Files:** `lib/http/withApi.ts:39`, `lib/rateLimit/guard.ts:25` — unconditional `await upstashRateLimit.limit(key)` in production for all routes, including trivial GETs (`material-units/resolve`, `forms/categories`). On serverless the RTT can rival the DB query.

**Fix:** enable `@upstash/ratelimit`'s ephemeral in-memory cache; or apply the limiter only to mutating/expensive routes and give cheap idempotent GETs a pass or a looser in-process limiter. Effort: small.

### F15. "All operations" view: up to 1000 unprojected rows; full refetch after optimistic delete
**Files:** `lib/db/queries/entries.ts:593-677` (`db.select()` = SELECT * incl. `remarks` text), `app/app/sites/[id]/operations/[type]/page.tsx:71-76,122-128` (5 types × limit 200), `AllOperationsPageClient.tsx:162` (`router.refresh()` after an already-optimistic delete re-runs the full 5-table SSR fetch), `:199-204` (hard cap banner, no pagination beyond it).

**Fix:** project list-view columns (drop/truncate `remarks`); remove the `router.refresh()` (optimistic state is already correct — verify no server-derived totals depend on it); add cursor pagination past 200/type. Effort: medium.

### F16. Nine pages are full `'use client'` with post-hydration fetch waterfalls
**Files:** `app/app/requests/resource/page.tsx:44-45`, `requests/field`, `admin/users`, `admin/approvals`, `admin/analytics`, `admin/live-feed`, `notifications`, `profile`, `admin/expenses`.

HTML shell → JS parse → client fetch → render, showing "Loading…" instead of data. The repo already has the right pattern: `dashboard/page.tsx` and `sites/[id]/page.tsx` fetch server-side with `Promise.all` and pass `initial*` props.

**Fix:** convert to server components passing initial data to a client child (SWR `fallbackData`). Do approvals last — combine with F12. Effort: medium, one page at a time.

### F17. Legibility for outdoor mobile users
**Files:** `.input-standard` placeholder `placeholder-slate-600` on `#020617` ≈ 3:1 contrast (`globals.css:130`; repeated in `ToolsHub.tsx:154`, `ToolCatalogManager.tsx:131`, `UnitsManager.tsx:138`, `GlobalSearchOverlay.tsx:143`) — below WCAG 4.5:1 and several of these inputs use the placeholder as their only label. `text-[9px]`/`text-[10px]` used for real content: running-total label `EntryLogList.tsx:151`, empty-state copy `:186`, type chips `AllOperationsPageClient.tsx:325`.

**Fix:** bump placeholders to slate-400/500 (validate 4.5:1 against `#020617`); floor content text at 12px, labels users must read at 14px+. One change in `globals.css` covers most inputs. Effort: small.

### F18. Field metadata duplicated between registry and zod schemas
**Files:** `components/logs/entryFieldRegistry.ts` (required-ness, min/max/step, e.g. `wagePerHead min 0.01`) vs `lib/validation/schemas.ts:107` (`positiveDecimalSchema(1000000)`) — two sources of truth for "what's valid"; `EntryForm.validate()` (`:142-166`) hand-rolls required checks instead of deriving from the schema. Given the F4 drift precedent, these will disagree eventually. (Positive: `isSplitLabourWorkType` is correctly shared client/server.)

**Fix:** make the F7 descriptor own both the field list and the zod schema, deriving form constraints (required/min/max/step) from the schema. Effort: medium; do as part of F7's validation step.

---

## P3 — dead code & polish

### F19. Dead code (safe deletions)
| Item | Location | Evidence |
|---|---|---|
| Stale drizzle introspect output | `lib/db/migrations/schema.ts` (10KB) + `lib/db/migrations/relations.ts` | Imported nowhere; `drizzle.config.ts:12` points at `lib/db/schema.ts`; still declares pg enums dropped in migration 0021 — an active footgun for anyone reading it as truth |
| `mergeVisualEntries` | `components/operations/entryFormat.tsx:127-172` | Exported, zero callers, no test (~46 lines) |
| `entryCategoryKey` | `components/operations/entryFormat.tsx:174-180` | Superseded by `gridCategoryKey` (6 refs); zero callers |
| `catalogNounForCategory` | `lib/catalog/addCta.ts:16-19` | Test-only export; mapping also duplicates `lib/catalog/overview.ts:17-35` `CATALOG_OPERATIONS[].noun` — collapse to one source |
| Constant-holder micro-files | `lib/http/notificationsKeys.ts` (4 lines), `lib/http/cacheHeaders.ts` (8 lines) | Pass-throughs; fold into consumers |

**Verified NOT dead (don't delete):** `proxy.ts` (the app's middleware — tested via `tests/proxy.test.ts`), `app/~offline` (referenced by `app/sw.ts:128`), `components/logs/DynamicEntryForm.tsx` (lazy-imported), `design-system/siteops/` (docs, not code), `lib/services/nonCritical.ts` and `lib/services/decimals.ts` (small but pass the deletion test — complexity reappears in 5–12 callers if removed).

Unused npm deps were not conclusively checked; run `npx depcheck` if wanted.

### F20. UI/UX polish batch (do opportunistically)
- **Mixed icon systems:** lucide-react (majority) + Material Symbols font in ~13 files (`EntryForm.tsx:308,320`, `CategoryPicker.tsx:199`, …) + a literal `⚠` emoji at `CategoryPicker.tsx:331`. Standardize on lucide; drop the icon-font payload.
- **Unassociated form labels:** `CategoryPicker.tsx:250-310` modal, `TransferForm.tsx:137-229`, split-labour inputs `EntryForm.tsx:457-476` — add `htmlFor`/`id` (the pattern already exists correctly in `FieldRow` at `EntryForm.tsx:378-436`).
- **Header touch targets ~36px:** `AppHeader.tsx:63-106` back/search/bell (`p-2` + 20px icon); entry-list edit/delete are 40px (`EntryLogList.tsx:163,172`). Target 44px.
- **Similarity check fires a POST per keystroke:** `CategoryPicker.tsx:254-257` — debounce ~300ms (pattern exists in `useGlobalSearch.ts:84`).
- **Ad-hoc z-index scale:** `z-30` export dropdown can slip under the `z-50` fixed chrome; values range to `z-[1000]`. Define a token scale.
- **Hand-rolled popovers/modals:** `DataExportPanel.tsx:151-237`, `DateFilterField`, `RowActionsMenu`, `SubcategoryCombobox`, `UnitSelect`, plus modals that skip `ModalShell` (`ToolLedgerDrawer`, `CatalogAddModal`, `MergeModal`) — converge on `ModalShell` + one popover primitive so focus-trap/Escape/scroll-lock behave identically.
- **Layout-jumping loaders:** `CatalogManager.tsx:237-238` and `ToolsHub.tsx:174` render bare "Loading…" text then swap to full content — use skeletons like `GlobalSearchOverlay.tsx:197-205`.
- **Approvals theming divergence:** `approvals/page.tsx:185-330` uses Material-compat tokens (`on-surface`, `surface-container`) and ~32px buttons vs the app-wide sky/slate `.btn-primary` 44-48px vocabulary — fix while doing F12.
- **`router.back()` in AppHeader** (`AppHeader.tsx:64`): on deep-linked arrivals, back can exit the app; prefer a computed logical-parent fallback.

---

## What is already good (protect; do not regress)

- **Server/DB tuning:** singleton pooled client (`lib/db/client.ts:34-42`); zero-DB-round-trip auth from JWT claims (`lib/auth/session.ts:26-40`, `proxy.ts:74-97`); single-round-trip SQL summaries (`entries.ts:510-554`, `sites.ts:46-65`); `Promise.all` fan-out for the 5-type fetch; thorough indexes incl. composite `(site_id, date DESC, created_at DESC)`, partial unread/active indexes, trigram GIN for remark search. `prepare: false` is a known, unavoidable cost of the Supabase transaction pooler.
- **Clean bundle:** `googleapis` server-only; lucide named imports; no heavy libs in client code; `next/dynamic` where it matters.
- **Centralized, safe error surfacing:** `lib/ui/toast.ts` maps codes to friendly copy, never leaks backend strings; no `alert()` anywhere. Keep it the only error channel.
- **Model deep modules to imitate:** `lib/http/client.ts` (`requestJson`), `lib/http/useApiQuery.ts`, `useGlobalSearch()` + `GlobalSearchOverlay` (full ARIA combobox, skeletons, typed empty states), `evaluateLabourSplit`, `lib/catalog/selectors.ts`, `lib/services/duplicateGuard.ts`, `confirmDialog()`.
- **UX fundamentals in place:** double-submit protection on every mutation path; optimistic updates with rollback (`EntryLogList.tsx:98-107`, `CategoryPicker.tsx:141-153`); 18 route `loading.tsx` files; safe-area insets throughout; reduced-motion honored (`globals.css:181-190` + `MotionConfig`); card-based entry lists avoid horizontal scroll; deliberate dark-only theme (not a half-finished dark mode).

---

## Suggested execution order

1. **Week 1 — P0 batch (small, independent, user-visible):** F1 inline validation messages → F2 replace native dialogs → F3 `inputMode` → F4 extract `resolveMaterialUnit` (decide one fallback behaviour + tests) → F5 unit picker.
2. **Week 2 — hotspot + route hygiene:** F6 cache catalog aggregate + optimistic catalog mutations; F8 `assertSiteWritable` + `withAuthedApi`.
3. **Weeks 3-4 — descriptor migration (F7), incremental:** step 1 table/PK maps in `entries.ts` (F9) → step 2 spend (F10) → step 3 display chains in `entryFormat.tsx` → step 4 validation/field metadata (F18). Each step ships alone behind existing tests.
4. **Then P2:** F11 review-flow extraction, F12 approvals split (+F16 for that page), F13 type moves, F14 rate-limit cache, F15 projection/pagination, F17 contrast/type floors.
5. **Anytime:** F19 deletions (one small PR), F20 polish items folded into whatever touches those files.

Run the existing suite with `--testTimeout=30000` (one describeDb test flakes at the 5s default under parallel load) and never `npm run db:migrate` (prod is push-managed; use `npm run db:apply` per-file).

---

## Appendix A — Implementation guardrails (read before fixing anything)

Context for a fresh session implementing these fixes. Goal: don't introduce new bugs. Everything here was verified against the working tree on 2026-07-17.

### A.0 Global pre-flight (applies to every fix)

- **Line numbers in this doc reflect the 2026-07-17 working tree, which had ~30 uncommitted modified files** (entry routes, EntryForm, entryFieldRegistry, schemas, catalog libs, etc. were all mid-flight for the global-work-stage feature — see `docs/superpowers/specs/2026-07-16-global-work-stage-design.md` and untracked `lib/db/migrations/0025_global_work_stage.sql`). Re-locate by symbol name, not line number, and check `git status` first — if that work is still uncommitted, coordinate or land it before refactoring the same files.
- **Verification loop:** `npm run lint` (this is `tsc --noEmit -p tsconfig.lint.json` — there is no eslint) and `npm run test` (vitest). DB-backed tests (`describeDb` in `lib/catalog/overviewQuery.test.ts`, `lib/db/queries/operationSummary.test.ts`, `lib/db/guard.test.ts`, `lib/db/queries/sites.spend.test.ts`, `lib/export/snapshot.test.ts`, `lib/backup/restoreSnapshot.test.ts`) need a DB env and flake at the 5s default under parallel load — run with `--testTimeout=30000` before declaring red/green. Playwright e2e: `e2e/smoke.spec.ts`, `route-migration.spec.ts`, `tools-inventory.spec.ts`.
- **Never run `npm run db:migrate`** — intentionally disabled (prod is push-managed, `__drizzle_migrations` is empty; it would replay all migrations). Schema changes go through `npm run db:generate` + a reviewed idempotent SQL file applied with `npm run db:apply -- <file>`.
- **Do not change the API envelope.** All routes return `successResponse(data, status, requestId)` / `errorResponse(code, message, status, details?, requestId)` from `lib/errors/response.ts` with codes from `lib/errors/codes.ts`; clients parse this via `requestJson` (`lib/http/client.ts`) into `ClientResult<T>`. Tests assert on this shape.
- **Toast discipline:** `lib/ui/toast.ts` deliberately never surfaces raw backend strings — `notifyError(result: ClientResult<unknown>, override?: string)` maps `result.code` through `friendlyErrorMessage`; `notifyGenericError(override?: string)` is the string-based escape hatch. Any fix that surfaces text to users must go through these, and new copy belongs in `lib/ui/toastMessages.ts` (has its own test).
- **`tests/migration/no-src-imports.test.ts` enforces import-path rules** — any file moves (F13, F19) must keep it green.
- **`withApi` (lib/http/withApi.ts) owns rate-limit + request-id + logging** for every route: handler receives `({ request, requestId }, ctx)`. Auth guards live in `lib/auth/guards.ts`: `getSessionFromRequest`, `requireAuth`, `requireAdmin`, `requireCapability`, `requireSiteAccess` — all header-based (no DB), all covered by `lib/auth/guards.test.ts` + `session.test.ts` + `ownership.test.ts`.

### A.1 Per-finding guardrails

**F1 (EntryForm validation messages)** — Correction to the sketch above: `notifyError` takes a `ClientResult`, **not a string**. For the local `validate()` string use `notifyGenericError(err)` (accepts an override string) or render inline. `validate()` (`EntryForm.tsx:142-166`) also handles the split-labour special case — keep its message text in sync with the zod messages in `lib/validation/schemas.ts` if you touch either. If adding inline per-field errors, thread them through the existing `FieldRow` props; don't fork a second field renderer. No test currently covers `validate()` — add one before changing it.

**F2 (native dialogs → confirmDialog)** — Signature: `confirmDialog({ title, message?, confirmLabel?, cancelLabel?, tone?: 'default'|'danger' }): Promise<boolean>`. It is **async** where `window.confirm` is sync — the call sites must become `await`, and the surrounding handlers already are async in all five files, but check that nothing relies on synchronous ordering (e.g. `SubcategoryCombobox` closes its popover before confirming — preserve that order). `ConfirmHost` must be mounted for the promise to resolve — it's rendered app-wide already (used by `EntryLogList`); verify it covers the tools pages too (they're under the same `app/app` shell). Use `tone: 'danger'` for deletes. The `window.prompt` rename in `ToolCategoryManager.tsx:47` needs a small form modal instead — reuse `ModalShell` from `components/ui/motion.tsx`.

**F3 (inputMode)** — `EntryField` in `entryFieldRegistry.ts` already carries `min/max/step`. Cleanest: derive in the number-field renderer — `step === 1 ? "numeric" : "decimal"` — or add an explicit `inputMode` property to `EntryField`. Registry has a test (`entryFieldRegistry.test.ts`) that will catch shape changes. Don't switch `type="number"` to `type="text"` — form state and `valueAsNumber`-style parsing assume number inputs.

**F4 (resolveMaterialUnit)** — Behavioural decision required before coding: create-route rejects unresolvable units with 400; update-route falls back to `unitRule.preferredName`. **Recommend standardizing on reject (400)** — silent fallback can change a stored unit on edit without the user noticing. But check `app/api/entries/[id]/route.test.ts` (new, untracked on 2026-07-17) for tests that may pin the fallback behaviour, and grep mobile client flows for reliance on it. Relevant existing modules: `materialUnitRuleFor` + tests in `lib/db/queries/materialUnitRule.test.ts`, unit helpers + tests in `lib/catalog/units.test.ts`, `lib/db/queries/materialUnits.test.ts`. Put the pure function in `lib/services/entries.ts` (currently exports `decimalFieldsFor`, `evaluateLabourSplit`, `LabourSplitResult`; tested in `lib/services/entries.test.ts`). Keep the exact user-facing error string (`"${materialType} must use ${allowedNames.join(" or ")} as the unit"`) unless you also update route tests asserting it.

**F5 (Transfer unit picker)** — The transfers API expects the unit's ID; keep submitting the same field name/shape (`unitCustomId`) so `app/api` transfer routes and approval flows are untouched. Model the picker on `components/logs/UnitSelect.tsx` but note F13: don't import its helpers from `lib/db/queries/materialUnits` in new code — this is the moment to put `displayUnitName`/`dedupeUnitOptionsByName` in a client-safe module. Check whether transfers are tool transfers, material transfers, or both (`components/transfers/TransferForm.tsx` handles a type switch) — the UUID field may only apply to one branch.

**F6 (catalog aggregate caching)** — Follow the existing cache pattern exactly: `getOrSetJson<T>(key, ttl, fn)` from `lib/cache/getOrSetJson.ts`, key helper added to `lib/cache/keys.ts` (see `catalogListNamesCacheKey` for a catalog-adjacent precedent), invalidation helper added to `lib/cache/invalidate.ts` and called from **every** catalog write route (`admin/catalog/*` create/rename/toggle/merge/reorder — grep for `invalidateCategoryListCache` to find them all; they already invalidate the category-list cache, so add the new invalidation beside it). `lib/cache/redis.ts` returns `null` without Redis env — `getOrSetJson` already degrades gracefully; keep the route working with `redis === null` (dev). Usage-count semantics: counts may be up to TTL stale after another admin's write — acceptable, but don't cache per-user data in the same key. `overviewQuery` has a DB-backed test (`lib/catalog/overviewQuery.test.ts`); `CatalogManager` mutation flows are exercised by `app/api/admin/catalog/merge/route.test.ts`. For the client half: `CatalogManager` was previously refactored for a double-fetch bug (see commit d29ba8a in its history) — read that diff before touching its SWR wiring.

**F7 (EntryTypeDescriptor)** — Non-negotiables to preserve during migration: (1) **incident is a fifth type** in some layers (DB, display, search) but has **no create form** in `entryFieldRegistry` — the descriptor interface must make form-related members optional or the incident descriptor partial; (2) incident's date is `created_at::date` (special-cased at `entries.ts:585`) while others use a `date` column — model as `dateColumn`/`dateExpr` per descriptor; (3) server modules must not import client modules — split the descriptor into a server part (`table`, `idColumn`, `spendExpr`, zod schemas) and a client part (fields, icon, renderSummary) keyed by the same `EntryType`, or the `no-src-imports` test and the F13 seam get worse, not better. Migrate one concern at a time behind the existing tests: `entries.test.ts`, `entryFormat.test.ts`, `mapEntryToFormValues.test.ts`, `entryFieldRegistry.test.ts`, `typeStyles.test.ts`, `schemas.test.ts`, `allOperationsView.test.ts`, `categoryView.test.ts`. Do **not** start this while the global-work-stage branch work is uncommitted — it touches the same 11 files.

**F8 (assertSiteWritable / withAuthedApi)** — `requireSiteAccess(request)` returns a union — success has `session`, failure has `{error, status}`; the copy-pasted guard is the narrowing. A `withAuthedApi` wrapper should preserve the exact error response (`errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId)`) — route tests assert on code/status. The ×4 site block has one deliberate asymmetry to keep: the ownership-failure message is entry-specific ("You can only log entries for sites you supervise") — parameterize the message, don't genericize it, or route tests fail. The success tail includes `runNonCritical(requestId, "analytics_cache_invalidation_failed", invalidateAdminAnalyticsCache(requestId))` — keep the event-name string, it's asserted/logged. Convert **one route first** (machinery has the simplest body), run its route test, then do the rest.

**F9 (entries.ts table maps)** — The three switches also encode the **returned row type** per case; a naive map loses type narrowing. Use a typed descriptor map (`satisfies Record<EntryType, {...}>`) and keep `getEntryById`'s return type a discriminated union. Drizzle constraint: `db.update(table)` needs the concrete table object, so the map values must be the actual schema exports, not names. `updateEntryById` uses `.returning()` — preserve. Incident is present in these switches (5 cases, not 4). Covered by `lib/db/queries/entries.test.ts` — read it first; it defines the contract.

**F10 (labour spend)** — The precedence is: split (mason+helper) → stored `salaryAmount` → `peopleCount × wagePerHead`. The SQL version (`labourSpendExpr`, `entries.ts:517-522`) and TS versions must stay in agreement; add a fixture-parity test (insert rows via test DB, assert SQL sum equals TS `labourSpend` sum) in `lib/db/queries/entries.test.ts` or `sites.spend.test.ts` (which already tests spend aggregation). `calculateLabourTotal` already exists (imported at `entries.ts:12` from `lib/services`) — check whether it IS the canonical formula and the fix is merely "use it in the other 3 places".

**F11 (review-flow extraction)** — The notify-admins step inserts notifications + a `fieldRequests` row inside the same transaction as the category insert — keep transactional boundaries identical. Noun strings ("category" vs "subcategory") appear in user-visible notification copy; parameterize carefully and diff the emitted strings before/after. Tests: `app/api/forms/subcategories/[id]/route.test.ts` exists; the categories POST route has **no test** — write one that pins current behaviour (review-required and auto-approved paths) before extracting.

**F12 (approvals split)** — The four `useOptimistic` reducers each encode approve/decline state transitions — port them per-component verbatim, then simplify. The page hand-rolls fetching because it predates `useApiResult`; when converting, `useApiResult<T>(url)` returns the `ClientResult` envelope (see `lib/http/useApiQuery.ts:43`) — match how `requests/field/page.tsx` consumes it. Approval actions must keep exact endpoints/verbs (`app/api/requests/field/[id]/route.test.ts`, `requests/resource/[id]/route.test.ts` pin them).

**F13 (type moves out of db/queries)** — Move only: `EntryType`, `MaterialWorkStage` (from `entries.ts:302,310`) and the **pure** helpers `displayUnitName`, `dedupeUnitOptionsByName` (from `materialUnits.ts`). Re-export from the old location (`export { ... } from`) in the first PR so nothing breaks, then update imports, then drop the re-export. `lib/types/entry.ts` already exists (row types) — extend it rather than creating a new file. Keep `lib/catalog/units.test.ts` + `materialUnits.test.ts` green; update `tests/migration/no-src-imports.test.ts` expectations only if it enumerates paths.

**F14 (rate-limit)** — `applyRateLimit` is called inside `withApi` for **every** route; exempting GETs changes protection for `admin/export` (expensive GET!) — exempt by explicit allowlist of cheap read routes, not by method. `@upstash/ratelimit` supports an `ephemeralCache` option on the `Ratelimit` constructor — check `lib/rateLimit/guard.ts` for how the limiter is constructed; that's the one-line, zero-behaviour-change option and should be tried first. `guard.ts` already no-ops without Upstash env (dev) — preserve.

**F15 (projection/pagination)** — Column projection changes the row type returned by `getEntriesBySite`; `AllOperationsPageClient` and `entryFormat.tsx` consume fields like `remarks` for display — audit consumers before dropping columns (truncation via SQL `left(remarks, 160)` may be safer than omission). `router.refresh()` removal: verify the day-total / running-total in `EntryLogList` and the summary header recompute client-side from the optimistic list, not from server props — if they come from server props, keep the refresh or recompute locally. Tests: `allOperationsView.test.ts`, `operationSummary.test.ts`.

**F16 (client pages → SSR)** — Copy the working pattern from `app/app/dashboard/page.tsx` / `sites/[id]/page.tsx`: server component + `Promise.all` + `initial*` props into a client child, client child passes `fallbackData` to SWR. Watch for: these pages read auth from client-side session context — the server versions must use the header-based session (`lib/auth/session.ts`) instead. `notifications/page.tsx` interacts with the push/SW layer — convert it last or skip it. Do NOT convert `admin/approvals` until F12 lands.

**F17 (contrast/type floors)** — Single highest-leverage edit: `.input-standard` in `globals.css:130`. Placeholder target ≈ slate-400 (`#94a3b8`) on `#020617` ≈ 8:1 — passes. The `text-[9px]/[10px]` bumps change layout in tight card rows (`EntryLogList` running totals, `AllOperationsPageClient` chips) — check at 375px width for wrapping after bumping. There are 26 micro-text call sites; the audit flagged 8 as user-critical — fix those, leave decorative ones.

**F18 (schema-derived field metadata)** — Do this **inside** F7 step 4, not standalone. Zod v-version in use exposes min/max via `_def` checks — deriving UI metadata from `_def` is brittle across zod upgrades; prefer descriptor-owned constants consumed by BOTH the zod schema builder and the field registry (single source, two consumers) over runtime introspection. `schemas.test.ts` + `entryFieldRegistry.test.ts` pin both sides.

**F19 (deletions)** — Order matters for `addCta.ts`: `catalogNounForCategory` is dead in app code but `addCtaLabel` is live — delete the function + its test cases, keep the file until the noun mapping is unified with `overview.ts`. `lib/db/migrations/schema.ts`/`relations.ts`: confirm `drizzle-kit` doesn't regenerate them on `db:generate` (they're introspect output — if a teammate re-runs introspect they reappear; consider adding a comment in README or .gitignore note instead of silent deletion). Grep-verify zero imports at deletion time, not from this doc — the tree moves. `lib/http/notificationsKeys.ts` / `cacheHeaders.ts`: inline into consumers only if each has ≤2 consumers at that time.

**F20 (polish batch)** — Debounce for `checkSimilarity`: copy the 180ms pattern from `useGlobalSearch.ts:84` (timer ref + cleanup), and keep the existing "similar detected" UX semantics (`CategoryPicker` shows a hint, doesn't block submit). Icon migration: Material Symbols is loaded as a font — removing the last usage lets you drop the font link (check `app/layout.tsx` / globals for the @font import) for a real payload win; migrate per-file, keep sizes (`w-5 h-5` ≈ 20px glyph). Touch targets: enlarge via padding, not icon size, to avoid layout shifts in `AppHeader`'s flex row. Z-index tokens: define the scale in `globals.css` as CSS vars and migrate overlays opportunistically — the only *active* bug is `z-30` DataExportPanel dropdown under `z-50` chrome; fix that one immediately, tokenize later.

### A.2 Regression map — which tests protect which fix

| Fix | Must stay green | Gap to fill first |
|---|---|---|
| F1 | — | Add `EntryForm.validate()` test |
| F2 | — | Manual: confirm dialogs on installed PWA |
| F3 | `entryFieldRegistry.test.ts` | — |
| F4 | `entries/[id]/route.test.ts`, `materialUnitRule.test.ts`, `units.test.ts`, `materialUnits.test.ts` | Unit tests for extracted `resolveMaterialUnit` |
| F6 | `overviewQuery.test.ts` (DB), `admin/catalog/merge/route.test.ts` | Cache-invalidation test per write route |
| F7 | `entries.test.ts`, `entryFormat.test.ts`, `mapEntryToFormValues.test.ts`, `entryFieldRegistry.test.ts`, `typeStyles.test.ts`, `schemas.test.ts`, `allOperationsView.test.ts`, `categoryView.test.ts` | — (richest coverage in repo) |
| F8 | `entries/{labour,machinery,expenses}/route.test.ts`, `guards.test.ts` | materials route has a test too — verify all 4 before/after |
| F9/F10 | `entries.test.ts`, `sites.spend.test.ts` (DB), `operationSummary.test.ts` (DB) | SQL↔TS labour-spend parity fixture test |
| F11 | `forms/subcategories/[id]/route.test.ts` | Categories POST route test (pin both review paths) |
| F12 | `requests/field/[id]/route.test.ts`, `requests/resource/[id]/route.test.ts` | Component-level tests optional; e2e smoke covers page load |
| F13 | `units.test.ts`, `materialUnits.test.ts`, `no-src-imports.test.ts` | — |
| F14 | `lib/http/request.test.ts`, `tests/proxy.test.ts` | Rate-limit guard unit test for exemption list |
| F15 | `allOperationsView.test.ts`, `operationSummary.test.ts` | — |
| F16 | e2e `smoke.spec.ts`, `route-migration.spec.ts` | — |
| F19 | full suite + `npm run lint` | — |

---

## Appendix B — Security audit

Read-only review of authN/authZ, injection surfaces, secrets, error hygiene, headers, scripts, push, and export. **Result: no critical or high findings.** The security architecture is deliberate and consistently applied. Findings below are medium/low hardening items, listed after the verified strengths so implementers know what must not be weakened.

### B.0 Verified strengths (do not regress while fixing anything else)

- **Identity-header spoofing is blocked by design.** `proxy.ts` strips inbound `x-siteops-*` identity headers **before every exit path** (including public-prefix and OPTIONS early returns) and re-sets them only from JWT claims verified locally against cached JWKS (`getClaims`). The comment in `proxy.ts:26-31` documents the invariant — any future middleware edit must preserve strip-before-exit.
- **Authorization is centralized and audited.** All 59 of 60 API route files call a guard (`requireAdmin`/`requireAuth`/`requireSiteAccess`/`requireCapability`); the single exception, `app/api/auth/create-profile/route.ts`, is a deliberate always-410 stub (self-signup disabled). Denials schedule a `permission.denied` audit entry (`lib/auth/guards.ts:19-38`). Ownership goes through the capability layer (`lib/auth/ownership.ts` — `resource:manage_all` override, never role-string literals), and `entries/[id]` enforces it on both PATCH (`:83`) and DELETE (`:241`).
- **SQL injection surfaces are clean.** The only `sql.raw` string-building interpolates identifiers from the app's own Drizzle schema metadata (`lib/catalog/overviewQuery.ts:19-24`, sourced from the constant `USAGE_SOURCES` table objects — no user input in the identifier position, and the safety argument is documented in-file). User search input is bound as a parameter inside the drizzle `sql` template (`lib/db/queries/search.ts:88-110`); the one `sql.raw` there interpolates a numeric constant threshold. Postgres `SET LOCAL statement_timeout` bounds the search query.
- **Mass assignment is prevented by explicit field destructuring** — routes pull named fields from zod-validated `validation.data` (e.g. `entries/labour/route.ts:29-34`) rather than spreading the body into inserts.
- **CSV formula injection is guarded** with a numeric-aware neutralizer (`lib/export/serialize.ts:41-56` — prefixes `'` on `=`, `+`, `-`, `@`, tab, CR cells while deliberately leaving decimal money strings summable) plus RFC 4180 quoting. Unit-tested (`serialize.test.ts`).
- **Error responses don't leak internals.** `handleDbError` (`lib/errors/db.ts`) maps PG error codes + constraint names to friendly copy and logs the raw detail server-side keyed by requestId; the client toast layer (`lib/ui/toast.ts`) independently refuses to render raw backend strings.
- **Secrets hygiene is sound.** `.gitignore` excludes `.env*` (only `.env.example` tracked); no keys/tokens found in tracked sources; `SUPABASE_SERVICE_ROLE_KEY` is read only in server-side `lib/auth/config.ts`; the only `NEXT_PUBLIC_` sensitive-adjacent value is the VAPID **public** key, which is public by protocol.
- **Scripts are injection-safe**: `scripts/db-apply.mts:39` uses `spawnSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-f", file])` — argument array, no shell interpolation.
- **Push endpoints require auth** (`app/api/push/subscribe/route.ts:23,45` — `requireAuth` on subscribe and unsubscribe); VAPID private key is env-only.
- **Headers**: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` locking camera/mic/geolocation, `frame-ancestors 'none'` in CSP.
- **Rate limiting keyed by userId first** (falls back to IP), so authenticated abuse can't be laundered through IP rotation.

### B.1 Findings

**S1 (medium) — CSP is report-only and permits `unsafe-inline` + `unsafe-eval`.**
`next.config.ts:8-19,32`: the policy ships as `Content-Security-Policy-Report-Only` with `script-src 'self' 'unsafe-inline' 'unsafe-eval'`. The in-file comment says promotion to enforcing is a planned follow-up. Until then, CSP provides zero XSS mitigation — and even once enforced, `unsafe-inline`/`unsafe-eval` in `script-src` neuters it against injected scripts.
*Exploit relevance:* any future XSS (none found today — React escaping + the toast discipline help) runs unimpeded.
*Fix:* review collected violation reports, drop `unsafe-eval` (usually only needed by dev tooling; verify the PWA/Serwist and PostHog snippets), move to nonce- or hash-based `script-src`, then flip the header name to enforcing. Test the installed PWA + service worker explicitly — SW script loading is a common CSP casualty.

**S2 (low-medium) — Missing role claim fails open to `SUPERVISOR` instead of failing closed.**
`lib/auth/session.ts:33`: `parseSessionRole(...) ?? ROLES.SUPERVISOR`. A verified JWT lacking the `user_role` claim (custom_access_token hook misconfigured or removed, token minted before hook deployment) is silently granted the supervisor role rather than rejected. Supervisor is the lower of the two roles, but it still holds real capabilities (create entries, read sites). Ownership checks limit blast radius.
*Fix:* treat a missing/unparseable role as unauthenticated (return `null`) or as a distinct "no role" that every capability check denies; alert on occurrences so a hook regression is noticed. Check `lib/auth/session.test.ts` — it may currently pin the supervisor default.

**S3 (low) — Rate limiting fails open and its unauthenticated key trusts `x-forwarded-for`.**
`lib/rateLimit/guard.ts:16-23`: returns `null` (no limiting) when `NODE_ENV !== "production"` or when the Upstash client is unconfigured — a missing env var in prod silently disables all rate limiting. The unauthenticated fallback key uses the first `x-forwarded-for` entry, which is platform-set on Vercel but client-spoofable if the app is ever self-hosted behind a proxy that appends rather than overwrites.
*Fix:* log a startup warning (or fail health checks) when `upstashRateLimit` is null in production; document the Vercel-only trust assumption next to the XFF parse. Coordinate with F14 — don't let the perf fix widen this.

**S4 (low) — Per-path rate-limit keys allow cross-endpoint spraying.**
`lib/rateLimit/guard.ts:23`: key is `user:${userId}:${pathname}`, so the limit applies per endpoint; a user can multiply their effective budget by the number of routes (~60). Fine for the current threat model (small authenticated user base), but there is no global per-user cap for e.g. a leaked token scenario.
*Fix (optional):* add a second, looser global `user:${userId}` bucket alongside the per-path one.

**S5 (low) — No `Strict-Transport-Security` header.**
`next.config.ts` sets no HSTS. Vercel adds it on `*.vercel.app` domains, but custom domains need it explicitly for downgrade protection.
*Fix:* add `Strict-Transport-Security: max-age=63072000; includeSubDomains` (add `preload` only after confirming all subdomains are HTTPS-only).

**S6 (informational) — Search wildcards, disabled-signup stub, commented-out code.**
User-supplied `%`/`_` in search reach the `ILIKE` branch un-escaped (`lib/db/queries/search.ts`) — the user only widens their *own* query, and the statement timeout bounds cost; no action needed. The 410 stub route keeps a commented-out signup implementation (`create-profile/route.ts:19-37`) — fine, but if F19's dead-code pass touches it, the comment documents why it stays.

### B.2 Coverage notes

Checked: middleware/header flow, all guard call sites (60 route files enumerated), ownership on entry mutation routes, both `sql.raw` sites, zod usage pattern on entry create/update, secrets grep + `.gitignore` + tracked-file check, `handleDbError`, security headers, CSP, `db-apply.mts`/backup script exec pattern, push subscribe/unsubscribe auth, CSV/JSON export serializers, rate-limit guard.
Not exhaustively checked: per-route zod coverage of every query param across all 60 routes, the Supabase RLS posture (the app connects with its own pooled role — RLS is presumably bypassed by design, making the app layer the sole enforcement point; worth a one-time confirmation that the anon key can't reach tables directly), and `npm audit` (run `npm run audit:ci`, which already exists, in CI).

---

## Appendix C — UX redesign vision: from functional tool to polished SaaS

Everything in F1–F5/F17/F20 is *repair*. This appendix is *aspiration*: what to build once repairs land, to make SiteOps feel like a modern SaaS product rather than an internal tool. Ordered by impact-per-effort. The dark-only OLED direction is right for this product (outdoor glare → high contrast; power-friendly on site phones) — keep it and lean in; do not add a light mode.

### C.1 Foundation: a real token layer + `components/ui` buildout (prerequisite for everything else)

Today `components/ui` holds only `Toggle`, `ApiUnavailableBanner`, `page-primitives`, `motion.tsx`; buttons/inputs/cards are CSS classes in `globals.css` (`.btn-primary`, `.input-standard`, `.card-standard`) and everything else is hand-rolled per feature (F20's popovers/modals list). SaaS polish is mostly *consistency*, and consistency needs owned primitives:

- **Tokens as CSS variables in `globals.css`:** semantic color roles (`--surface-1/2/3`, `--text-primary/secondary/muted`, `--accent`, `--danger`, `--success`), a 4px spacing scale, a type ramp (12/14/16/18/24/30 — nothing below 12, per F17), radius scale, and the z-index scale F20 calls for (`--z-dropdown:30, --z-sticky:50, --z-overlay:60, --z-modal:70, --z-toast:90, --z-confirm:100`). Migrate the sky/slate values you already use — this is codification, not a re-skin.
- **Primitive components** (each replacing the hand-rolled copies inventoried in F20): `Button` (primary/secondary/ghost/danger × sm/md/lg, built-in loading spinner + disabled state — every feature currently re-implements "saving…" state), `Input`/`NumberInput` (label wiring, error slot, `inputMode`, prefix/suffix for ₹ and units), `Select`/`Combobox` (replaces `SubcategoryCombobox`, `UnitSelect`, export multiselect), `Popover` + `Menu` (replaces `RowActionsMenu`, export dropdown), `Sheet` (bottom drawer — mobile-native pattern for `ToolLedgerDrawer` and entry actions), `Skeleton`, `EmptyState` (icon + message + CTA), `StatCard`. All modals converge on the existing `ModalShell`.
- **One icon system** (lucide, per F20), sized off the token scale.

Payoff: every later item in this appendix becomes assembly instead of bespoke work, and new features inherit polish for free.

### C.2 The entry-logging flow: optimize for seconds-per-entry (the product's core loop)

A supervisor logs entries many times a day, often standing, in sunlight, with one hand. The current form is correct but neutral — it treats the 1st entry and the 40th identically. Make repetition fast:

- **Smart defaults:** date defaults to last-used date within the session (not just today); work stage pre-filled from the site's last entry; unit auto-assign already exists — extend the idea.
- **Recency-ranked options:** `CategoryPicker`/`SubcategoryCombobox` should surface "recently used on this site" at the top (localStorage per site — no backend change needed).
- **Save-and-add-another:** after a successful save, offer "+ Add another <type>" that keeps date/stage/category and clears only the varying fields. Cuts a full navigation round-trip per entry — the single biggest seconds-per-entry win available.
- **Sticky action bar:** submit/cancel pinned above the safe-area inset (pattern half-exists), with the running form validity visible — button label shows *why* it's disabled ("Missing Work Type"), which also reinforces the F1 fix.
- **Numeric entry ergonomics:** large stepper buttons for `peopleCount`, currency formatting-as-you-type with `tabular-nums` for wage/amounts, quantity+unit as one visual field group.
- **Duplicate hint, not block:** `duplicateGuard` exists server-side; surface a gentle "Similar entry logged 2h ago — continue?" inline instead of a post-submit error.

### C.3 Dashboard & site pages: from lists to insight (the "SaaS look")

What separates internal-tool from SaaS is *the data telling you something before you ask*:

- **KPI strip** on dashboard and site detail: StatCards for today's spend, entries this week, active sites, pending approvals — each with a small trend indicator (↑12% vs last week). `siteOperationSummary`/`siteTrackedSpend` already compute the aggregates; this is presentation.
- **Spend-over-time sparkline** per site card and a stacked-by-type weekly bar on site detail. One shared chart primitive, SVG, no heavy chart lib — the data is already in `getEntriesBySite`. (When building these, follow the repo's dataviz guidance: consistent categorical palette matched to the existing per-type colors in `typeStyles.ts`, so chart colors and entry-chip colors agree.)
- **Budget context:** the operation-consolidation spec (2026-06-04) added budget concepts — show budget-vs-actual progress bars on category cards; color only as a *secondary* signal (icon + % label primary, per the F20/A11y rule).
- **Activity feed** module on dashboard (`admin/live-feed` exists as a page — a compact 5-row version on the dashboard makes the product feel alive).

### C.4 Navigation: flatten the perceived depth

The operations hierarchy (site → operations → type → category → entry) is deep. Current back behavior is `router.back()` (F20 flags it). SaaS-grade navigation:

- **Breadcrumbs** on operations pages (Site / Operations / Labour / Brickwork) — cheap, kills disorientation, and gives F20's logical-parent-back fix a UI home.
- **Command palette:** `GlobalSearchOverlay` is already excellent — extend it from *find* to *do*: "Log labour entry", "Go to approvals", "Export data" as action results. This is the highest-signal "modern SaaS" marker and mostly wiring, since the overlay's combobox plumbing exists.
- **Segmented type filter** (All | Labour | Materials | Machinery | Expenses) as sticky chips on the all-operations view, instead of navigation-only filtering.

### C.5 Approvals: inbox, not table (pairs with F12)

Approvals are the admin's daily triage. When F12 splits the page, redesign each section as an **inbox pattern**: card queue with avatar/site/age, one-tap Approve / Decline with undo-toast (5s window before the API call is irrevocable — the `useOptimistic` plumbing already supports this), batch-select for the "10 category requests after a busy weekend" case, and a zero state that celebrates ("All caught up ✓" — as an icon, not an emoji). Mobile: swipe-right approve / swipe-left decline via framer-motion drag (already a dependency).

### C.6 PWA/offline affordances: make the app's superpower visible

The app is a PWA with a service worker, but the UX never *shows* it. Field sites have dead zones:

- **Connection status pill** in the header (subtle "Offline — changes will sync") driven by `navigator.onLine` + fetch failures; `ApiUnavailableBanner` exists as a starting point.
- **Optimistic entry queue:** an entry submitted offline goes into a visible "Pending sync (2)" tray rather than failing. This is real engineering (IndexedDB queue + background sync) — treat as a roadmap feature, but it's *the* differentiator for this product category.
- **Last-synced timestamp** on data views so a supervisor knows whether totals are fresh.

### C.7 Micro-interactions & perceived speed

- Standardize motion: 150–200ms ease-out for hover/press, 250–300ms for overlay enter, via two `motion.tsx` presets; everything respects the existing reduced-motion config.
- Skeletons everywhere loaders exist (F20's layout-jump fix), matched to final layout heights so nothing shifts.
- Press feedback on every tappable card (`active:scale-[0.99]` + `cursor-pointer`), success micro-confirmations (checkmark morph on save button before the toast).
- Number transitions on KPI/running totals (count-up on change) — cheap delight, high "polish" perception.

### C.8 Suggested sequencing

1. **C.1 tokens + primitives** while doing F17/F20 (same files, one migration).
2. **C.2 entry-flow wins** (defaults, recency, save-and-add-another, sticky bar) — pure client, no API changes, immediately felt by every daily user.
3. **C.4 breadcrumbs + segmented filters**, then command-palette actions.
4. **C.3 KPI strip + sparklines** (presentation over existing queries), **C.5 approvals inbox** with F12.
5. **C.6 offline queue** as a planned feature with its own spec (`docs/superpowers/specs/` pattern) — do not improvise it.

Guardrails: every new primitive keeps the A.0 invariants (toast discipline, envelope, `no-src-imports`), meets 44px touch targets and 4.5:1 contrast from day one, and replaces — never wraps — the hand-rolled copy it supersedes, so the F20 inventory shrinks with each step.
