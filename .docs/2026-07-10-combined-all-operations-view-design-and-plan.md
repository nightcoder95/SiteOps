# Combined "All Operations" Date-Range View — Design & Implementation Plan

Date: 2026-07-10
Status: Approved design, ready for implementation
Scope: SiteOps-Web

## 0. Handoff — read this first (for the implementing session)

**What we're building.** A per-site **"All Operations"** view that shows every **spend** entry
(Labour, Material, Machinery, Expense — the four types that carry a cost) for **one site** across a
**date range**, as one chronological, type-badged list — with client-side type toggles, sort,
per-day totals, and a grand spend total. It removes the need to open each operation type separately
to see a date range. **Incident is excluded** (no money; not part of this expense view).

**Where.** New URL `/app/sites/[id]/operations/all`, reached from a new full-width **"All
Operations"** card on top of the Operations Queue on the site detail page. Route reuses the
existing `[type]` segment with `type = "all"`.

**Why it's small.** The data layer already supports `getEntriesBySite(siteId, "all", ...)`. The
work is: (1) lift a preview cap behind a flag, (2) a server branch that flattens the result, (3) a
new client component, (4) an entry-point card, (5) a small shared-code extraction, (6) tests.

**Plan in brief (do in this order — see §9 for detail).**
1. Extract shared code (`DateFilterField`, `entryFormat.ts`, `typeStyles.ts`) — pure move, no
   behavior change.
2. Backend: add `fullAll` flag to `EntriesFilters` + limit logic.
3. Server route: whitelist `"all"`, branch, flatten → `CombinedRow[]`, compute `capped`.
4. New client `AllOperationsPageClient`.
5. Entry-point card in `SiteDetailPageClient`.
6. Tests (query, route, component, entry-point, E2E) + verify.

**Guardrails — the implementing session MUST follow these. Do NOT deviate, assume, or invent:**
- Build **strictly** what §5–§10 describe. If reality contradicts the doc (a helper is named
  differently, a type has moved, an assumption is wrong), **STOP and report** — do not silently
  improvise a different design.
- **Verify every referenced symbol exists before using it** (`getEntriesBySite`,
  `ALL_TYPE_PREVIEW_LIMIT`, `clampLimit`, `EntriesFilters`, `EntryTypeIcon`, `getTypeColor`,
  `entrySpend`, `serializeRow`, `DateFilterField`, `renderEntrySummary`). Paths are in §4/§10.
- **Single-site only.** Do **not** add cross-site aggregation, CSV export, or a global nav entry —
  those are explicit non-goals (§2).
- **No new DB migration. No new API route.** SSR page handles data (§10).
- Step 1 (shared extraction) is a **pure move**: the existing per-type page must render and test
  **identically** afterward. Do not "improve" logic while moving it.
- Keep spend math to **one** definition (§5.2 audit note) — combined totals must reconcile to the
  rupee with the per-type pages.
- Respect the locked decisions in §3 and the edge-case handling in §7. Type filtering is
  **client-side**; date + sort + `types` go through the URL.
- Follow existing repo conventions (SWR `useApiResult` hooks, `withApiRoute`, error `ERROR_CODES`,
  `card-standard`/`input-standard` classes, `en-IN` INR currency). Match surrounding code style.
- Run the §8.6 verification (lint, typecheck, vitest, targeted e2e, manual smoke) before claiming
  done. Evidence before assertions.

---

## 1. Problem

Today, viewing logs for a date range is **per-operation-type**. A supervisor who wants
"everything that happened / was spent on site X between two dates" must open Labour, set the
range, then Material, then Machinery, then Expense, then Incident — five separate visits, five
separate mental sums. There is no single place to see all operation types for one site across a
date range.

Client requirement: one view, one site, all operation types, one date range, with the ability to
narrow to specific types and see a combined spend total.

## 2. Goal & Non-Goals

**Goal.** A per-site "All Operations" view at `/app/sites/[id]/operations/all` that lists every
**spend** entry (Labour, Material, Machinery, Expense) in a chosen date range as one
chronological, type-badged list, with client-side type toggles, sort, and a grand spend total.
**Incident is excluded** — it carries no cost and is not part of this expense-focused view.

**Non-goals (explicitly out of scope for this iteration).**
- Cross-**site** aggregation (this is single-site only). The components should not hard-block a
  future global variant, but no global route is built now.
- Category / Work-Stage filtering in the combined view (type-specific; dropped here).
- Changing the existing per-type page behavior.
- New export/CSV of the combined view (existing export flows unchanged).
- **Incident entries** (safety/block reports carry no cost). Excluded from this expense view; the
  query still returns them for `type="all"` but the server drops the `incident` array when
  building the combined list.

## 3. Key Decisions (locked)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Aggregation axis | One site, 4 spend types (Labour, Material, Machinery, Expense) |
| 2 | Types included | 4 spend types, **user-toggleable** via chips, default all on. **Incident excluded** |
| 3 | Entry point | Full-width **"All Operations"** card on top of the Operations Queue grid |
| 4 | Result layout | Chronological, grouped by date, **type-badged** rows, day totals + grand total |
| 5 | Route | Reuse existing `[type]` route with `type = "all"` |
| 6 | Type filtering | **Client-side** (full set already loaded); date + sort drive the server query |
| 7 | Filters shown | Date range + Type chips + Sort. **No** Category / Work-Stage |
| 8 | Backend cap | Lift `ALL_TYPE_PREVIEW_LIMIT` for this SSR path; keep preview cap for other callers |

## 4. Current State (what exists)

- Route: `app/app/sites/[id]/operations/[type]/page.tsx` (server) +
  `OperationDetailPageClient.tsx` (client). `allowedTypes` currently excludes `"all"`.
- Query: `getEntriesBySite(siteId, type, filters)` in `lib/db/queries/entries.ts` **already
  supports `type: "all"`**, returning `{ labour, material, machinery, expense, incident }` — each
  array filtered by `from`/`to`/`category`/`workStage`/`sort`.
- **Cap.** In the `"all"` branch the per-type limit is
  `Math.min(clampLimit(filters?.limit), ALL_TYPE_PREVIEW_LIMIT)` where
  `ALL_TYPE_PREVIEW_LIMIT = 5`. So `"all"` today returns at most 5 rows per type — a preview.
- API `GET /api/sites/[id]/entries?type=all` already whitelists `all` and is auth/ownership-gated.
  (No current UI caller of `type=all` was found; the preview cap exists for API/preview use.)
- Reusable UI: `EntryTypeIcon` (`components/constants/EntryTypeIcon.tsx`), `getTypeColor` (local
  in `SiteDetailPageClient.tsx`), `DateFilterField` + currency/date helpers (local in
  `OperationDetailPageClient.tsx`), `serializeRow` (`lib/utils/serialize.ts`),
  `formatDate` (`lib/utils/formatDate.ts`).
- Spend math per type already lives in the query (`calculateLabourTotal`,
  `calculateMachineryTotal`, `sortSpendRows`) and in the client (`entrySpend`). The combined view
  reuses the same spend definitions to stay consistent with per-type totals.

## 5. Design

### 5.1 Backend — lift the preview cap without breaking preview callers

`getEntriesBySite` must return the full date-ranged set for the combined view, but the 5-row
preview behavior of `type=all` must be preserved for any existing/ future preview caller.

Add an explicit opt-out on `EntriesFilters`:

```ts
export type EntriesFilters = {
  from?: string;
  to?: string;
  limit?: number;
  category?: string;
  workStage?: MaterialWorkStage;
  sort?: "newest" | "oldest" | "highest_spend" | "lowest_spend";
  /**
   * For type="all" only. When false, each per-type list is capped to
   * ALL_TYPE_PREVIEW_LIMIT (dashboard/preview use). When true, the full
   * clampLimit() cap (<=200 per type) applies. Ignored for single types.
   * Default: false (preserves existing preview behavior).
   */
  fullAll?: boolean;
};
```

In the limit computation:

```ts
const limit =
  type === "all"
    ? (filters?.fullAll
        ? clampLimit(filters?.limit)
        : Math.min(clampLimit(filters?.limit), ALL_TYPE_PREVIEW_LIMIT))
    : clampLimit(filters?.limit);
```

Rationale for a flag (not a new function): keeps one query path, one set of `where`/`orderBy`
builders, zero duplication. Default `false` means **no existing caller changes behavior**.

Cap stays at 200/type (via `clampLimit`). With 4 spend types that is an 800-row worst case per
view — acceptable for SSR; see §7 edge case E7 for the "range too wide" handling.

### 5.2 Server route — accept `type = "all"`

In `app/app/sites/[id]/operations/[type]/page.tsx`:

1. Add `"all"` to `allowedTypes`.
2. Keep the existing single-type path unchanged.
3. When `type === "all"`:
   - **If `from > to`, swap them** before querying (see E3) so an inverted range still returns data.
   - Parse `from`, `to`, `sort`, and `types` (CSV, validated against the 4 spend types) from
     `searchParams` (ignore `category`, `workStage`).
   - Call `getEntriesBySite(siteId, "all", { from, to, sort, fullAll: true, limit: 200 })`.
   - **Drop the `incident` array** from the result; use only `{labour, material, machinery, expense}`.
   - Compute `capped: EntryType[]` = spend types whose returned array length === 200.
   - **Flatten + normalize** the four spend arrays into one array (server-side, so the
     client receives a ready-to-render list):

```ts
// SpendType = "labour" | "material" | "machinery" | "expense" (excludes "incident")
type CombinedRow = {
  type: SpendType;
  id: string;          // per-type PK (labourEntryId | materialEntryId | machineryEntryId | expenseEntryId)
  date: string;        // YYYY-MM-DD (entry.date)
  spend: number;       // rupee amount for this entry
  entry: Record<string, unknown>; // serialized raw row for summary rendering
};
```

   - Render a **new** `AllOperationsPageClient` (not `OperationDetailPageClient`) with:
     `site`, `siteId`, `initialRows: CombinedRow[]`, `initialFilters: { from, to, sort }`,
     `highlightId`.

The `entryId`, `entryDate`, `entrySpend` helpers already encode the per-type field mapping; reuse
them (extract to shared module, §5.5) to build `CombinedRow` on the server.

> **Spend single-source-of-truth (audit note).** The query layer already has
> `calculateLabourTotal` / `calculateMachineryTotal` and sums `cost`/`amount` for material/expense;
> the client `entrySpend` re-implements the same math. To avoid drift, the extracted `entrySpend`
> must be the **one** definition both use — either (a) have the query's `sortSpendRows` callers call
> `entrySpend`, or (b) keep `entrySpend` as a thin wrapper delegating to the query calculators. Pick
> one during implementation and delete the duplicate. The normalization step (`spend` field) and the
> per-type page must agree to the rupee.

> **Route file split:** because the server component now branches into two very different client
> components, keep both branches in the single `page.tsx` (one `if (type === "all") { ... }` early
> return that renders `AllOperationsPageClient`, else the existing path). This avoids a new route
> segment and keeps `[type]` as the one operations route.

### 5.3 New client — `AllOperationsPageClient.tsx`

Location: `app/app/sites/[id]/operations/[type]/AllOperationsPageClient.tsx`.

Props:

```ts
type Props = {
  site: { name: string; location: string };
  siteId: string;
  initialRows: CombinedRow[];
  initialFilters: { from: string; to: string; sort: string; types: SpendType[] };
  capped: SpendType[];              // spend types that hit the 200 cap (E7 notice)
  highlightId?: string | null;
};
```

State:
- `filters` (`from`, `to`, `sort`) — mirrors per-type page; drives server query on Apply.
- `enabledTypes: Set<EntryType>` — client-side toggle set, initialized from
  `initialFilters.types` (URL `types=` CSV) or all 4 spend types if absent. **Persisted in the URL** (see
  chip-persistence note below) so it survives an Apply navigation.
- `rows` — local working copy of `initialRows`, re-synced on prop change (mirrors the per-type
  `useEffect(() => setEntries(initialEntries), [initialEntries])` pattern for delete/refresh).
- `openDateField`, `deletingId` — as per-type page.

Derivation (memoized on `rows`, `enabledTypes`, `filters.sort`):
1. `visibleRows = rows.filter(r => enabledTypes.has(r.type))`.
2. `grandTotal = sum(visibleRows.spend)`.
3. Group `visibleRows` by `date` → `Map<date, CombinedRow[]>`.
4. Sort day groups:
   - `newest` / `oldest` → by date.
   - `highest_spend` / `lowest_spend` → by day-group total spend (mirrors per-type logic).
5. Within a day, keep server order (already date+createdAt sorted per type; merge stable). For a
   mixed day, sort rows by `spend` desc when a spend sort is active, else by nothing (stable).
6. `visibleLogCount = visibleRows.length`.

> Running-total-per-category (from the per-type page) is **not** carried over — it is meaningless
> across mixed types. Replaced by the grand total (top) + per-day totals.

Filter bar (`card-standard`, grid):
- `DateFilterField` From (shared component).
- `DateFilterField` To (shared component).
- Sort `<select>`: Newest / Oldest / Highest spend / Lowest spend.
- **Type chips row** (full width, below): one toggle button per **spend type** (Labour, Material,
  Machinery, Expense — 4 chips) using `EntryTypeIcon` + label + `getTypeColor`. Active =
  filled/colored, inactive = muted. Clicking toggles membership in `enabledTypes`. Guard:
  **disallow toggling the last enabled type off** (min 1 enabled) — see E5.
- Apply Filters (pushes date+sort to URL) + Clear Filters buttons (same pattern as per-type).

Apply/Clear:
```ts
function applyFilters() {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.sort) params.set("sort", filters.sort);
  // Persist chips only when a strict subset is enabled (all-on = omit param).
  if (enabledTypes.size < ALL_TYPES.length) {
    params.set("types", ALL_TYPES.filter((t) => enabledTypes.has(t)).join(","));
  }
  const qs = params.toString();
  router.push(qs
    ? `/app/sites/${siteId}/operations/all?${qs}`
    : `/app/sites/${siteId}/operations/all`);
}
function clearFilters() {
  setFilters({ from: "", to: "", sort: "newest" });
  setEnabledTypes(new Set(ALL_TYPES));   // reset chips too
  router.push(`/app/sites/${siteId}/operations/all`);
}
```

**Chip persistence (audit fix).** Because Apply calls `router.push`, the server re-renders and the
client remounts — a purely-local `enabledTypes` would reset to all-on and silently lose the user's
type selection every time they change the date. Therefore chips are encoded in the URL as
`types=labour,expense` and read back server-side into `initialFilters.types`. Toggling a chip only
re-derives locally (no navigation); the value is written to the URL on the next Apply. The server
still fetches **all** types regardless of `types=` (type filtering stays client-side) — `types=`
only seeds the initial chip state. Invalid/unknown values in `types=` are ignored; empty/absent =
all on.

Header card: title "All Operations", site name, `visibleLogCount` "Logs", `grandTotal` currency.

> **No cross-entry merging (audit note).** The per-type page merges same-date + same-category
> entries into one card via `mergeVisualEntries`. The combined view **does not merge** — it renders
> each entry as its own row. Merging is per-type-category specific and ambiguous across mixed types,
> and the goal here is a faithful chronological ledger. `mergeVisualEntries` is still extracted for
> the per-type page but is unused by `AllOperationsPageClient`. Consequence: the combined day-total
> and grand-total sum individual rows, which equals the per-type merged totals (sums are
> associative), so numbers reconcile with the per-type pages.

Row rendering: reuse `renderEntrySummary(entry, type)` logic (extracted, §5.5). Each row card:
- colored **type badge** (`EntryTypeIcon` + `typeLabel[type]`, `getTypeColor`),
- the existing per-type summary body,
- amount,
- Edit link `/app/logs/[id]?type=<type>` + Delete button (same as per-type).

Delete: reuse the per-type optimistic pattern — `DELETE /api/entries/[id]?type=<type>`, drop the
row locally, roll back + `notifyError` on failure, `router.refresh()` on success. Because rows are
already flattened with their `type`, delete needs no special casing.

Day-group header: date label + "Day total" = sum of that day's visible spend.

Empty state: when `visibleRows.length === 0`, show the existing dashed "No matching logs found."
Distinguish two causes in copy is optional; keep the single existing message (E6).

### 5.4 Entry point — "All Operations" card

In `app/app/sites/[id]/SiteDetailPageClient.tsx`, above the 5-card `operationMeta` grid, add a
full-width card/link:

- `href={/app/sites/${siteId}/operations/all}`.
- Left: label "All Operations" + sub "Every expense, one date range".
- Right: combined all-time total = `sum of totalSpend across the 4 spend types` from
  `initialSummary` (the incident entry in `initialSummary` is **not** summed here — spend types
  only); and combined `totalCount` over the 4 spend types.
- Style: reuse `card-standard`, full width (`sm:col-span-2` if placed inside the grid, or its own
  section above the grid), sky accent to read as the "master" entry.

No new API needed for the card — `initialSummary` already carries per-type `totalCount` /
`totalSpend`; sum client-side.

### 5.5 Shared extraction (targeted refactor)

To avoid duplicating ~160 lines of `DateFilterField` and the per-type helpers across two clients,
extract into shared modules **before** building the new client:

1. `components/operations/DateFilterField.tsx` — move `DateFilterField` + its private date helpers
   (`parseDateValue`, `toDateValue`, `monthLabel`, `calendarDays`, `formatDateFieldValue`).
2. `components/operations/entryFormat.ts` — move `formatCurrency`, `entryId`, `entryDate`,
   `entrySpend`, `entryCategoryKey`, `mergeVisualEntries`, `renderEntrySummary`, `typeLabel`,
   `materialStages`, `sumField`. (These are pure/presentational; `renderEntrySummary` stays a
   function returning JSX.) Note: `entryId`/`entryDate`/`entrySpend`/`renderEntrySummary` still
   accept the full `EntryType` (they're shared with the per-type page which handles incident); the
   combined view simply never passes `"incident"`.
3. `components/operations/typeStyles.ts` — move `getTypeColor` out of `SiteDetailPageClient` so
   both the queue cards and the new type chips/badges share one color source of truth.

Update `OperationDetailPageClient.tsx` and `SiteDetailPageClient.tsx` to import from the shared
modules. **Behavior must be identical** — this is a pure move (verified by the existing per-type
page still rendering + tests green). No logic edits during the move.

Rationale: the brainstorming/deepening principle — one copy, tested once, both consumers benefit.

## 6. Data Flow (summary)

```
Site detail card  ──(link)──►  /app/sites/[id]/operations/all?from&to&sort
                                       │
                       page.tsx (server, type==="all" branch)
                                       │  auth + ownership (existing)
                                       ▼
        getEntriesBySite(siteId,"all",{from,to,sort,fullAll:true,limit:200})
                                       │  → {labour,material,machinery,expense,incident}
                                       ▼
              drop incident → flatten+normalize 4 spend types
                          → CombinedRow[] (serializeRow on raw)
                                       ▼
                        <AllOperationsPageClient initialRows=... />
                                       │
              client: filter(enabledTypes) → group by date → sort → render
                                       │
                    Apply → router.push(?from&to&sort)  (re-runs server)
                    Toggle chip → pure client re-derive (no navigation)
```

## 7. Edge Cases & Error Handling

| # | Case | Handling |
|---|------|----------|
| E1 | Invalid `type` in URL (typo) | Existing `allowedTypes` check → `notFound()`. `"all"` now whitelisted. |
| E2 | Site archived / not owned / no session | Existing guards in `page.tsx` (`notFound()` / `redirect`) run before the `all` branch — unchanged. |
| E3 | `from` > `to` (inverted range) | Untouched, `dateWhere` builds `gte(from) AND lte(to)` → empty set (dead-end). **Decision: swap.** In `page.tsx`, if `from>to`, swap the two before querying so the user still sees data. Add a small note in the view — "Adjusted date range (From was after To)." — so the flipped dates aren't confusing. Document the swap in a code comment. |
| E4 | Only `from` or only `to` | Already handled by `dateWhere` (open-ended range). No range = all-time (capped at 200/type). |
| E5 | User toggles every type off | Prevent: block toggling the **last** enabled chip off (min 1). Guarantees a non-empty type set and avoids a confusing "you filtered everything out" empty state. |
| E6 | No entries in range (valid) | Existing dashed "No matching logs found." empty state. |
| E7 | Range so wide a spend type hits the 200 cap | Rows are capped per type at 200 (newest-first by default). Show a subtle notice when any spend-type list length === 200: "Showing the most recent 200 <type> entries — narrow the date range to see more." Compute per-type via `capped: SpendType[]` prop. **Known limitation:** length===200 can false-positive when a type has *exactly* 200 rows in range; acceptable (the notice is advisory, data still correct). A precise fix (separate `COUNT(*)`) is a follow-up if it matters. |
| E8 | Zero-spend rows in a spend sort | All 4 combined types carry a real amount, so spend sorts (`highest_spend`/`lowest_spend`) rank cleanly; a ₹0 entry (e.g. an expense logged as 0) simply sorts at the bottom/top. No no-amount rows exist (incident excluded). |
| E9 | Deep-link `?highlight=<id>` from global search | Reuse the per-type highlight effect: pulse + scroll the matching row, strip `highlight`/`date` params via `history.replaceState`. `CombinedRow.id` already carries the PK to match. |
| E10 | Delete fails (network / 4xx/5xx) | Optimistic drop → rollback on `!res.ok` + `notifyError(res)` (existing pattern). |
| E11 | Delete last row of a day | Day group disappears on re-derive (group built from `rows`); no empty day header lingers. |
| E12 | Timezone / date grouping | All 4 spend types have a real `date` column (YYYY-MM-DD). Grouping key is date-only, so no TZ drift between filter and display. (Incident's `createdAt`-based date is moot — incident is excluded.) |
| E13 | Currency locale | Reuse `formatCurrency` (`en-IN`, INR) — identical to per-type/site pages. |
| E14 | Very large combined payload (1000 rows) | Acceptable for SSR now. If it becomes a problem, follow-up: paginate or lower per-type cap. Noted, not built. |
| E15 | Serialization of Decimal/Date fields | Run `serializeRow` on each raw entry before embedding in `CombinedRow` (Decimals→string, Dates→ISO), same as the per-type page passes `serializeRow(entries)`. |

## 8. Testing

### 8.1 Query unit tests (`lib/db/queries/entries` — extend existing suite)
- `type="all", fullAll:true` returns all types uncapped up to `clampLimit` (seed >5 rows/type, assert full count).
- `type="all"` **without** `fullAll` still caps each list at `ALL_TYPE_PREVIEW_LIMIT` (regression guard for existing callers).
- Date range filters each spend type correctly (`from`/`to`, only-`from`, only-`to`).
- `sort` variants order correctly per type.

### 8.2 Server route
- `type=all` branch: auth/ownership/archived guards return the right statuses (mirror existing per-type route tests).
- Flatten/normalize: given a stub `getEntriesBySite` result, assert `CombinedRow[]` shape, correct `date`/`spend`/`id` for the 4 spend types, **the `incident` array is dropped** (no incident rows in output), `capped[]` computed when a list length===200.
- `from>to` swap behavior (assert the query receives swapped bounds + the "adjusted range" flag is set).

### 8.3 Component (`AllOperationsPageClient`)
- Renders grouped-by-date, type-badged rows; grand total = sum of visible spend; day totals correct.
- Type chip toggle removes/re-adds rows and recomputes totals **without navigation**.
- Chip selection persists across an Apply (URL `types=`); reload with `?types=labour,expense` seeds the right chips.
- Cannot disable the last enabled type (E5).
- Sort select changes grouping order (newest/oldest/highest/lowest spend).
- Empty state when a range yields nothing.
- Cap notice shows when `capped` non-empty; "adjusted date range" note shows on a swapped range.
- Delete: optimistic remove, rollback + toast on failure, `router.refresh()` on success.
- Highlight deep-link pulses + scrolls the right row and strips the param.

### 8.4 Entry-point (`SiteDetailPageClient`)
- "All Operations" card renders, links to `/operations/all`, shows all-time total/count summed over
  the 4 spend types (incident not included).

### 8.5 E2E (Playwright, extend `e2e/`)
- From a site: tap "All Operations" → set a date range → Apply → see mixed spend-type rows.
- Toggle off "Machinery" → machinery rows disappear, grand total drops by the machinery sum.
- Change date + Apply → the disabled "Machinery" chip stays disabled (URL persistence).
- Toggle off all-but-one → last chip won't disable.
- Edit link navigates to `/app/logs/[id]?type=...`.

### 8.6 Manual verification
- `npm run lint`, `npm run typecheck`, `vitest`, targeted Playwright spec, and load the page against seed data for each spend type; confirm per-type page still renders identically after the shared extraction.

## 9. Implementation Order (task breakdown)

1. **Shared extraction** (`DateFilterField`, `entryFormat.ts`, `typeStyles.ts`); rewire the two
   existing clients; verify per-type page + tests unchanged. *(pure refactor, no behavior change)*
2. **Backend**: add `fullAll` to `EntriesFilters` + limit logic; query tests (incl. preview
   regression).
3. **Server route**: whitelist `"all"`, add the `type==="all"` branch — parse `from/to/sort`,
   call query with `fullAll`, flatten→`CombinedRow[]`, compute `capped[]`, render new client;
   `from>to` swap.
4. **New client** `AllOperationsPageClient` — filter bar, type chips, grouping/sort, grand/day
   totals, row rendering, delete, highlight, empty + cap notices.
5. **Entry point** card in `SiteDetailPageClient`.
6. **Tests**: query, route, component, entry-point, E2E.
7. **Verify**: lint, typecheck, unit, e2e, manual smoke on seed data.

## 10. Files Touched

- `lib/db/queries/entries.ts` — `EntriesFilters.fullAll`, limit logic (query tests alongside).
- `app/app/sites/[id]/operations/[type]/page.tsx` — whitelist `all`, branch + normalize.
- `app/app/sites/[id]/operations/[type]/AllOperationsPageClient.tsx` — **new**.
- `app/app/sites/[id]/SiteDetailPageClient.tsx` — entry-point card; import shared `typeStyles`.
- `app/app/sites/[id]/operations/[type]/OperationDetailPageClient.tsx` — import shared modules
  (remove now-shared local code).
- `components/operations/DateFilterField.tsx` — **new** (moved).
- `components/operations/entryFormat.ts` — **new** (moved).
- `components/operations/typeStyles.ts` — **new** (moved).
- Tests: `lib/db/queries/*`, route test, component test, `e2e/*`.

No DB migration. No new API route (SSR page handles it; existing `/api/sites/[id]/entries?type=all`
remains available and unchanged for preview use).
