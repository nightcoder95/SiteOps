# Operations: Category-First View + Entry Consolidation Fix

Date: 2026-07-15
Status: Approved design — pending implementation plan

This spec covers two related changes to site operations:

1. **Bug fix** — stop separate entry submissions from being consolidated into one row (expense, labour, machinery).
2. **Feature** — replace the flat date-list on the operation detail page with a category-first view, drilling into a per-category detail page.

The two are linked: the category feature assumes each submission is its own independent entry (which the fix guarantees), just as materials already work.

---

## Part 1 — Consolidation bug fix

### Root cause (confirmed in code)

`POST /api/entries/{expenses,labour,machinery}` each do:

```
existing = findMatching*Entry(siteId, date, category)
if existing: merge*Entry(existing.id, ...)   // sums amount/qty/count into one row
else:        insert*Entry(...)
```

When a second entry with the same `(siteId, date, category)` is logged, it is merged into the first row instead of being stored separately. Two real submissions collapse into one.

- [app/api/entries/expenses/route.ts](../../../app/api/entries/expenses/route.ts) — `findMatchingExpenseEntry` / `mergeExpenseEntry`
- [app/api/entries/labour/route.ts](../../../app/api/entries/labour/route.ts) — `findMatchingLabourEntry` / `mergeLabourEntry`
- [app/api/entries/machinery/route.ts](../../../app/api/entries/machinery/route.ts) — `findMatchingMachineryEntry` / `mergeMachineryEntry`

**Materials** (`app/api/entries/materials/route.ts`) was already fixed — it always inserts. It is the reference pattern.

**Incident** and **dynamic** routes already insert-only — not affected.

### The merge is destructive

`merge*Entry` (in [lib/db/queries/entries.ts](../../../lib/db/queries/entries.ts)) sums numeric fields into the existing row, keeps only the first `description`/`remarks`, and bumps `updatedAt`. Original per-submission values, submission count, and later remarks are **not stored anywhere**. `auditLogs` covers privileged actions only (not entry POSTs). Backups run every 2 days and can't reconstruct intra-day merges.

**Decision: no backfill.** Historical merged rows are left as-is. The fix is forward-only — new entries are stored separately.

### Fix

Mirror the materials route in all three routes:

- Remove the `findMatching*` + `merge*` branch.
- Always `insert*Entry(...)`.
- Always return `201`.
- Drop the now-unused imports (`findMatching*Entry`, `merge*Entry`).

The `findMatching*Entry` / `merge*Entry` query functions in `lib/db/queries/entries.ts` are left in place unused, mirroring how the materials fix left `findMatchingMaterialEntry` / `mergeMaterialEntry` in place. (Optional cleanup: remove all six unused fns in a follow-up — out of scope here.)

### Acceptance

- Logging two expense/labour/machinery entries with the same site+date+category produces **two** rows, each independently editable/deletable.
- Response status is `201` for every create.
- Materials behaviour unchanged.

---

## Part 2 — Category-first operation view

### Goal

On an operation detail page (e.g. Materials for a site), instead of a long flat list of every log by date, show a grid of **categories** (Metals, Cement, Sand…). Clicking a category opens a dedicated page listing only that category's logs, sorted by date, with search + filters.

Applies to the **4 spend types**: `material`, `expense`, `labour`, `machinery`. **Incident stays on the current flat list** (unchanged).

### Category = grouping key per type

| Type      | Category key    | Examples                         |
|-----------|-----------------|----------------------------------|
| material  | `materialType`  | Metals, Cement, Sand             |
| expense   | `category`      | Labour, Materials, Equipment, Misc |
| labour    | `workType`      | Mason, Helper, custom types      |
| machinery | `equipmentType` | Excavator, Mixer                 |

**Important:** the existing `entryCategoryKey()` helper returns `materialType|workStage` for materials. The grid must group by `materialType` **alone** — work-stage becomes a filter inside the category detail page, not part of the grid identity. A new dedicated grid-category helper is needed; do not reuse `entryCategoryKey` for material grouping.

### Landing page — `/app/sites/[id]/operations/[type]`

Default view = **By Category**, with a toggle to **All Logs** (the existing date-grouped list, kept intact).

```
┌─────────────────────────────────────────────┐
│ ← Back to site                              │
│ [icon] MATERIALS LOGS          12 Logs      │
│        Site Name               ₹1,20,000     │
├─────────────────────────────────────────────┤
│  [ By Category ]  [ All Logs ]   ← toggle    │
├─────────────────────────────────────────────┤
│  ┌───────────┐ ┌───────────┐ ┌───────────┐  │
│  │ [icon]    │ │ [icon]    │ │ [icon]    │  │
│  │ Metals    │ │ Cement    │ │ Sand      │  │
│  │ 5 entries │ │ 3 entries │ │ 4 entries │  │
│  │ ₹80,000   │ │ ₹25,000   │ │ ₹15,000   │  │
│  │ 12 Jul    │ │ 10 Jul    │ │ 09 Jul    │  │
│  └───────────┘ └───────────┘ └───────────┘  │
└─────────────────────────────────────────────┘
```

- **By Category** (default): grid of tiles, one per distinct category present in the entries. Tile = icon + name + entry count + total spend + last-activity date.
- **All Logs**: the current `OperationDetailPageClient` date-grouped list with its existing filters — unchanged behaviour, now behind the toggle.
- Tiles are derived from the already-fetched `entries` (server page already loads them, limit 200) — no extra query.
- Toggle state can live in the URL (e.g. `?view=all`) so it survives refresh/back; default is category.
- Incident: no toggle, no grid — renders the existing flat list directly.

### Category detail page — new route `/app/sites/[id]/operations/[type]/[category]`

Server page. Ownership + archived checks mirror the parent page. Fetches entries for the site+type filtered to the one category, then renders a client component.

```
┌─────────────────────────────────────────────┐
│ ← Back to Materials                         │
│ [icon] METALS                  5 entries    │
│        Site Name               ₹80,000       │
├─────────────────────────────────────────────┤
│  [ 🔍 Search remarks / amount ............ ] │
│  From [__]  To [__]  [Stage ▾]  [Sort ▾]     │
│  ( Stage filter: materials only )            │
├─────────────────────────────────────────────┤
│  12 Jul 2026                    Day ₹40,000  │
│   ┌───────────────────────────────────────┐ │
│   │ Metals — 2 ton — ₹40,000       ✎  🗑  │ │
│   │ remarks…                              │ │
│   └───────────────────────────────────────┘ │
│  10 Jul 2026                    Day ₹40,000  │
│   ┌───────────────────────────────────────┐ │
│   │ Metals — 2 ton — ₹40,000       ✎  🗑  │ │
│   └───────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

- **Header**: category name, its total spend, entry count, back-link to the category grid.
- **Controls**:
  - **Search** — free-text, client-side, over `remarks`/`description` **and** amount (matches numeric amount as text). Debounced.
  - **Date range** (from/to) + **Sort** (newest / oldest / highest spend / lowest spend).
  - **Work-stage filter** — materials only.
- **Body**: reuse the existing per-date log-card list from `OperationDetailPageClient` — each entry an independent card (post-fix), with edit/delete per row, running totals, day totals, highlight/pulse, and optimistic delete.

### Navigation

- Tile click → category detail page.
- After **create or edit** of an entry → land on that entry's **category detail page**, with the entry highlighted (extend the existing `?highlight=<entryId>` mechanism already used by global search).
- Back: category detail → category grid; category grid → site.

### Routing / data notes (resolve during planning)

- `[category]` param carries a category value that may contain spaces (e.g. "Ready Mix"). Must be URL-encoded on link-out and decoded server-side. Validate the decoded value against the known categories for that type; 404 on unknown.
- The server page already loads entries via `getEntriesBySite(siteId, type, { category, … })`. **Verify the existing `category` filter semantics for `material`** — it may key off subcategory/workStage rather than `materialType`. If it does not filter by `materialType`, fetch by site+type and filter to the category server-side (or extend the query). This is the main implementation risk.

### Reuse

- `entryFormat` helpers: `entrySpend`, `entryDate`, `renderEntrySummary`, `formatCurrency`, `typeLabel`, `materialStages`.
- `DateFilterField`, `EntryTypeIcon`.
- Existing log-card markup, running-total logic, highlight/pulse, optimistic delete from `OperationDetailPageClient`.
- **New**: grid-category helper (materialType-based key + per-category aggregation), category grid component, category detail server page + client component, client-side search filter.

### Component boundaries

- `page.tsx` (parent) — unchanged data load; chooses grid vs all-logs by `?view` for spend types, flat list for incident.
- Category grid component — pure: takes entries + type, renders tiles; one job.
- Category detail server page — auth + fetch + serialize.
- Category detail client — search/filter state + reused card list.

### Acceptance

- Opening a spend-type operation shows the category grid by default; toggling to All Logs shows the current date list.
- Each tile shows name, entry count, total spend, last-activity date; incident shows no grid.
- Clicking a tile opens the category detail page listing only that category's entries, newest first.
- Search filters by remarks/description/amount; date range, sort, and (materials) work-stage filters work.
- Creating/editing an entry lands on its category detail page with the entry highlighted.
- Deep-linking a category URL works; unknown category 404s.

---

## Out of scope

- Backfilling / un-merging historical consolidated rows.
- Removing the unused `findMatching*` / `merge*` query functions.
- Any change to incident operations.
- Pagination beyond the existing 200-entry limit.

---
---

# Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop separate entries being consolidated into one row (expense/labour/machinery), and replace the flat operation log list with a category-first view that drills into a per-category detail page with search + filters.

**Architecture:** Three API routes drop their merge-on-match branch to always insert (mirroring materials). On the client, category aggregation, entry grouping, and search are extracted into **pure, node-testable functions**; a shared `EntryLogList` presentational component renders the grouped cards for both the existing "All Logs" view and the new category detail page. A new server route renders per-category logs, reusing `getEntriesBySite`'s existing `category` filter.

**Tech Stack:** Next.js App Router (server + client components), Drizzle ORM (Postgres/Supabase), Vitest (node env), Tailwind.

## Testing constraints (MANDATORY — read before writing any test)

- **The only database is production, used by live clients. Tests MUST NOT connect to, read from, or write to any real database.** Every test mocks `@/lib/db/client` and the query functions, exactly like the existing `app/api/**/route.test.ts` files. No test imports a real DB connection. No integration test hits Postgres.
- Vitest runs in **`environment: 'node'`** with **no `@testing-library` / jsdom**. Do **not** write React component render tests — they will not run. All testable logic must live in pure `.ts` functions tested directly. UI components (`.tsx`) are verified by manual QA + typecheck only.
- Test files: `*.test.ts` under `components/**`, `lib/**`, or `app/**` (per `vitest.config` include globs). Not `.tsx`.
- Run the suite with `npm test` (`vitest --run`). Typecheck with `npx tsc --noEmit`.
- Any DB read the engineer performs for manual verification must be **read-only** (SELECT only) — never INSERT/UPDATE/DELETE.

## File structure

**Modify:**
- `app/api/entries/expenses/route.ts` — drop merge branch, always insert.
- `app/api/entries/labour/route.ts` — drop merge branch, always insert.
- `app/api/entries/machinery/route.ts` — drop merge branch, always insert.
- `components/operations/entryFormat.tsx` — export `gridCategoryKey` (materialType-based, no work-stage).
- `app/app/sites/[id]/operations/[type]/OperationDetailPageClient.tsx` — consume extracted grouping fn + shared list component; add By Category / All Logs toggle.
- `components/logs/EntryForm.tsx` — post-create/edit navigation to category detail + highlight.

**Create:**
- `components/operations/categoryView.ts` — pure: `buildCategorySummaries`, `entryMatchesSearch`, `buildGroupedRows`, `entrySuccessDestination`.
- `components/operations/categoryView.test.ts` — unit tests for the above.
- `components/operations/CategoryGrid.tsx` — presentational tile grid.
- `components/operations/EntryLogList.tsx` — shared grouped-card list (extracted from `OperationDetailPageClient`).
- `app/app/sites/[id]/operations/[type]/[category]/page.tsx` — category detail server page.
- `app/app/sites/[id]/operations/[type]/[category]/CategoryDetailPageClient.tsx` — search + filters + `EntryLogList`.
- `app/api/entries/expenses/route.test.ts`, `.../labour/route.test.ts`, `.../machinery/route.test.ts` — route tests (mocked db).

**Spend types** referred to below = `material | expense | labour | machinery`. These are the only types with a category grid/detail. `incident` and `all` are untouched.

---

### Task 1: Fix expense consolidation

**Files:**
- Modify: `app/api/entries/expenses/route.ts`
- Test: `app/api/entries/expenses/route.test.ts` (create)

- [ ] **Step 1: Write the failing test** (mock db + query fns; assert insert is called and merge is NOT, status 201 for a second same-category entry)

```ts
// app/api/entries/expenses/route.test.ts
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireSiteAccess, mockCheckOwnership, mockFindSite,
  mockInsertExpense, mockAssertCatalog, mockGetSpend, mockGetAdmins,
} = vi.hoisted(() => ({
  mockRequireSiteAccess: vi.fn(),
  mockCheckOwnership: vi.fn(),
  mockFindSite: vi.fn(),
  mockInsertExpense: vi.fn(),
  mockAssertCatalog: vi.fn(),
  mockGetSpend: vi.fn(),
  mockGetAdmins: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireSiteAccess: mockRequireSiteAccess }));
vi.mock("@/lib/auth/ownership", () => ({ checkOwnership: mockCheckOwnership }));
vi.mock("@/lib/db/client", () => ({
  db: { query: { sites: { findFirst: mockFindSite } } },
}));
vi.mock("@/lib/db/queries/entries", () => ({
  insertExpenseEntry: mockInsertExpense,
  // findMatchingExpenseEntry / mergeExpenseEntry intentionally absent:
  // if the route still imports them, this mock throws at import → test fails.
}));
vi.mock("@/lib/db/queries/sites", () => ({ getSiteTrackedSpend: mockGetSpend }));
vi.mock("@/lib/db/queries/notifications", () => ({
  createNotification: vi.fn(), getAllAdmins: mockGetAdmins,
}));
vi.mock("@/lib/cache/invalidate", () => ({ invalidateAdminAnalyticsCache: vi.fn() }));
vi.mock("@/lib/services/nonCritical", () => ({ runNonCritical: vi.fn() }));
vi.mock("@/lib/validation/catalogList", () => ({ assertInCatalogList: mockAssertCatalog }));

import { POST } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/entries/expenses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const base = { siteId: "s1", date: "2026-07-15", category: "Materials", description: "cement", amount: 100 };

describe("POST expense — no consolidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSiteAccess.mockResolvedValue({ session: { user: { id: "u1", role: "supervisor" } } });
    mockAssertCatalog.mockResolvedValue({ ok: true, value: "Materials" });
    mockFindSite.mockResolvedValue({ supervisorId: "u1", budget: null, name: "Site", archivedAt: null });
    mockCheckOwnership.mockReturnValue(true);
    mockGetSpend.mockResolvedValue("0");
    mockGetAdmins.mockResolvedValue([]);
    mockInsertExpense.mockImplementation(async (d: any) => ({ expenseEntryId: "e-new", ...d }));
  });

  it("always inserts (never merges) and returns 201", async () => {
    const res = await POST(req(base));
    expect(res.status).toBe(201);
    expect(mockInsertExpense).toHaveBeenCalledTimes(1);
  });

  it("second same site+date+category entry inserts a second row (201)", async () => {
    await POST(req(base));
    const res = await POST(req(base));
    expect(res.status).toBe(201);
    expect(mockInsertExpense).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest --run app/api/entries/expenses/route.test.ts`
Expected: FAIL — route still imports `findMatchingExpenseEntry`/`mergeExpenseEntry`, so the `@/lib/db/queries/entries` mock (which omits them) yields `undefined`, and/or second call returns 200. (If it fails at import, that is the expected red.)

- [ ] **Step 3: Edit the route to always insert**

In `app/api/entries/expenses/route.ts`:

Replace the import block:
```ts
import { insertExpenseEntry } from "@/lib/db/queries/entries";
```
Replace the try-body branch (the `const existing = await findMatchingExpenseEntry(...)` through the `insertExpenseEntry({...})` ternary) with:
```ts
    const entry = await insertExpenseEntry({
      siteId,
      date,
      description,
      amount: String(amount),
      category,
      createdBy: auth.session.user.id,
    });
```
And change the final return so status is always 201:
```ts
    return successResponse(entry, 201, requestId);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest --run app/api/entries/expenses/route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (unused `findMatchingExpenseEntry`/`mergeExpenseEntry` imports are gone).

- [ ] **Step 6: Commit**

```bash
git add app/api/entries/expenses/route.ts app/api/entries/expenses/route.test.ts
git commit -m "fix: stop expense entries consolidating into one row"
```

---

### Task 2: Fix labour consolidation

**Files:**
- Modify: `app/api/entries/labour/route.ts`
- Test: `app/api/entries/labour/route.test.ts` (create)

- [ ] **Step 1: Write the failing test** — same structure as Task 1, adapted to labour. Mock `@/lib/db/queries/entries` exporting only `insertLabourEntry`. Mock `@/lib/validation/schemas` is not needed (real schema validates); send a valid labour body:

```ts
const base = { siteId: "s1", date: "2026-07-15", workType: "Mason", peopleCount: 2, wagePerHead: 500 };
```
Mocks required: `@/lib/auth/guards` (requireSiteAccess), `@/lib/auth/ownership` (checkOwnership), `@/lib/db/client` (db.query.sites.findFirst), `@/lib/db/queries/entries` ({ insertLabourEntry }), `@/lib/cache/invalidate` (invalidateAdminAnalyticsCache), `@/lib/services/nonCritical` (runNonCritical), `@/lib/validation/catalogList` (assertInCatalogList → { ok: true, value: "Mason" }).
`mockInsertLabour.mockImplementation(async (d) => ({ labourEntryId: "l-new", ...d }))`.
Assert: first POST 201 + insert called once; second identical POST 201 + insert called twice.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest --run app/api/entries/labour/route.test.ts`
Expected: FAIL (route imports `findMatchingLabourEntry`/`mergeLabourEntry`; second call returns 200).

- [ ] **Step 3: Edit the route**

In `app/api/entries/labour/route.ts`:
- Import: `import { insertLabourEntry } from "@/lib/db/queries/entries";`
- Delete the whole `const existing = await findMatchingLabourEntry(...)` `if (existing) { ... return successResponse(merged, 200, requestId); }` block (lines ~61–86). Keep only the `const entry = await insertLabourEntry({ ... })` insert that follows, plus its `runNonCritical(...)` and `return successResponse(entry, 201, requestId);`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest --run app/api/entries/labour/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck** — `npx tsc --noEmit` → no errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/entries/labour/route.ts app/api/entries/labour/route.test.ts
git commit -m "fix: stop labour entries consolidating into one row"
```

---

### Task 3: Fix machinery consolidation

**Files:**
- Modify: `app/api/entries/machinery/route.ts`
- Test: `app/api/entries/machinery/route.test.ts` (create)

- [ ] **Step 1: Write the failing test** — same structure. Mock `@/lib/db/queries/entries` exporting only `insertMachineryEntry`. Valid body:

```ts
const base = { siteId: "s1", date: "2026-07-15", equipmentType: "Excavator", count: 1, totalCost: 5000 };
```
Mocks: `@/lib/auth/guards`, `@/lib/auth/ownership`, `@/lib/db/client`, `@/lib/db/queries/entries` ({ insertMachineryEntry }), `@/lib/cache/invalidate`, `@/lib/services/nonCritical`. (Machinery route has no catalogList assert for equipmentType — confirm against the route; only mock what the route imports.) Assert first/second POST both 201, insert called 1 then 2 times.

- [ ] **Step 2: Run to verify fail** — `npx vitest --run app/api/entries/machinery/route.test.ts` → FAIL.

- [ ] **Step 3: Edit the route** — In `app/api/entries/machinery/route.ts`:
- Import: `import { insertMachineryEntry } from "@/lib/db/queries/entries";`
- Delete the `const existing = await findMatchingMachineryEntry(...)` `if (existing) { ... return successResponse(merged, 200, requestId); }` block. Keep the `insertMachineryEntry({ ... })` insert + `runNonCritical` + `return successResponse(entry, 201, requestId);`.

- [ ] **Step 4: Run to verify pass** — PASS.
- [ ] **Step 5: Typecheck** — `npx tsc --noEmit` → clean.
- [ ] **Step 6: Commit**

```bash
git add app/api/entries/machinery/route.ts app/api/entries/machinery/route.test.ts
git commit -m "fix: stop machinery entries consolidating into one row"
```

---

### Task 4: Pure category + grouping + search helpers

**Files:**
- Modify: `components/operations/entryFormat.tsx` (add `gridCategoryKey`)
- Create: `components/operations/categoryView.ts`
- Test: `components/operations/categoryView.test.ts`

- [ ] **Step 1: Add `gridCategoryKey` to `entryFormat.tsx`** (distinct from `entryCategoryKey`, which appends work-stage for material)

```ts
// components/operations/entryFormat.tsx — add near entryCategoryKey
export function gridCategoryKey(entry: Entry, type: EntryType): string {
  if (type === "labour") return String(entry.workType ?? "Labour");
  if (type === "material") return String(entry.materialType ?? "Material");
  if (type === "machinery") return String(entry.equipmentType ?? "Machinery");
  if (type === "expense") return String(entry.category ?? "Misc");
  return String(entry.incidentType ?? "Incident");
}
```

- [ ] **Step 2: Write the failing test**

```ts
// components/operations/categoryView.test.ts
import { describe, expect, it } from "vitest";
import { buildCategorySummaries, entryMatchesSearch, buildGroupedRows } from "./categoryView";

const m = (over: Record<string, unknown>) => ({
  materialEntryId: Math.random().toString(), materialType: "Metals", workStage: "Foundation",
  quantity: "1", cost: "100", date: "2026-07-10", createdAt: "2026-07-10T00:00:00Z", ...over,
});

describe("buildCategorySummaries", () => {
  it("groups material by materialType (ignores work-stage) with count/spend/last-activity", () => {
    const entries = [
      m({ materialType: "Metals", cost: "100", date: "2026-07-10" }),
      m({ materialType: "Metals", workStage: "Slab", cost: "50", date: "2026-07-12" }),
      m({ materialType: "Cement", cost: "30", date: "2026-07-11" }),
    ];
    const out = buildCategorySummaries(entries as any, "material");
    const metals = out.find((c) => c.key === "Metals")!;
    expect(metals.count).toBe(2);
    expect(metals.totalSpend).toBe(150);
    expect(metals.lastActivity).toBe("2026-07-12");
    expect(out.map((c) => c.key).sort()).toEqual(["Cement", "Metals"]);
  });
});

describe("entryMatchesSearch", () => {
  it("matches remarks case-insensitively", () => {
    expect(entryMatchesSearch(m({ remarks: "Site A delivery" }) as any, "material", "delivery")).toBe(true);
  });
  it("matches amount as text", () => {
    expect(entryMatchesSearch(m({ cost: "1500" }) as any, "material", "1500")).toBe(true);
  });
  it("empty query matches everything", () => {
    expect(entryMatchesSearch(m({}) as any, "material", "")).toBe(true);
  });
  it("non-match returns false", () => {
    expect(entryMatchesSearch(m({ remarks: "abc", cost: "10" }) as any, "material", "zzz")).toBe(false);
  });
});

describe("buildGroupedRows", () => {
  it("renders each entry as its own independent card for every spend type", () => {
    const entries = [
      { expenseEntryId: "e1", category: "Materials", amount: "100", date: "2026-07-10", createdAt: "2026-07-10T01:00:00Z" },
      { expenseEntryId: "e2", category: "Materials", amount: "200", date: "2026-07-10", createdAt: "2026-07-10T02:00:00Z" },
    ];
    const { groupedRows, totalSpend } = buildGroupedRows(entries as any, "expense", "newest");
    const day = groupedRows.find((g) => g.date === "2026-07-10")!;
    expect(day.rows).toHaveLength(2);          // NOT visually merged
    expect(day.rows.every((r) => r.editable)).toBe(true);
    expect(totalSpend).toBe(300);
  });
});
```

- [ ] **Step 3: Run to verify fail** — `npx vitest --run components/operations/categoryView.test.ts` → FAIL (module not found).

- [ ] **Step 4: Implement `categoryView.ts`**

```ts
// components/operations/categoryView.ts
import {
  type Entry, type EntryType,
  entrySpend, entryDate, entryId, gridCategoryKey,
} from "./entryFormat";

export type CategorySummary = {
  key: string;
  count: number;
  totalSpend: number;
  lastActivity: string;
};

export function buildCategorySummaries(entries: Entry[], type: EntryType): CategorySummary[] {
  const map = new Map<string, CategorySummary>();
  for (const entry of entries) {
    const key = gridCategoryKey(entry, type);
    const date = entryDate(entry, type) || "";
    const prev = map.get(key) ?? { key, count: 0, totalSpend: 0, lastActivity: "" };
    prev.count += 1;
    prev.totalSpend += entrySpend(entry, type);
    if (date > prev.lastActivity) prev.lastActivity = date;
    map.set(key, prev);
  }
  return [...map.values()].sort((a, b) => b.totalSpend - a.totalSpend || a.key.localeCompare(b.key));
}

export function entryMatchesSearch(entry: Entry, type: EntryType, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    entry.remarks, entry.description,
    entry.amount, entry.cost, entry.totalCost,
    entry.salaryAmount, entry.masonSalaryAmount, entry.helperSalaryAmount, entry.peopleCount,
  ]
    .filter((v) => v != null)
    .map((v) => String(v).toLowerCase())
    .join(" ");
  return haystack.includes(q);
}

export type GroupedRow = {
  entries: Entry[];
  primary: Entry;
  total: number;
  editable: boolean;
};
export type GroupedDate = { date: string; rows: GroupedRow[] };

export function buildGroupedRows(
  entries: Entry[],
  type: EntryType,
  sort: string,
): { groupedRows: GroupedDate[]; runningTotals: Map<string, number>; totalSpend: number; visibleLogCount: number } {
  const totalSpend = entries.reduce((sum, e) => sum + entrySpend(e, type), 0);

  // Every spend type now shows independent cards (post consolidation-fix).
  const byDate = new Map<string, Entry[]>();
  for (const entry of entries) {
    const dateKey = entryDate(entry, type) || "Unknown";
    byDate.set(dateKey, [...(byDate.get(dateKey) ?? []), entry]);
  }
  let groupedRows: GroupedDate[] = [...byDate.entries()].map(([date, dateEntries]) => {
    const sorted = [...dateEntries].sort((a, b) => {
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return at - bt;
    });
    return {
      date,
      rows: sorted.map((entry) => ({
        entries: [entry], primary: entry, total: entrySpend(entry, type), editable: true,
      })),
    };
  });

  groupedRows.sort((left, right) => {
    if (sort === "highest_spend" || sort === "lowest_spend") {
      const lt = left.rows.reduce((s, r) => s + r.total, 0);
      const rt = right.rows.reduce((s, r) => s + r.total, 0);
      return sort === "highest_spend" ? rt - lt : lt - rt;
    }
    const lt = new Date(left.date).getTime();
    const rt = new Date(right.date).getTime();
    return sort === "oldest" ? lt - rt : rt - lt;
  });

  const chronological = [...groupedRows].sort(
    (l, r) => new Date(l.date).getTime() - new Date(r.date).getTime(),
  );
  const runningTotals = new Map<string, number>();
  const runningByCategory = new Map<string, number>();
  for (const group of chronological) {
    for (const row of group.rows) {
      const categoryKey = gridCategoryKey(row.primary, type);
      const id = entryId(row.primary, type);
      const key = id ? String(id) : `${group.date}|${categoryKey}`;
      const next = (runningByCategory.get(categoryKey) ?? 0) + row.total;
      runningByCategory.set(categoryKey, next);
      runningTotals.set(key, next);
    }
  }
  const visibleLogCount = groupedRows.reduce((s, g) => s + g.rows.length, 0);
  return { groupedRows, runningTotals, totalSpend, visibleLogCount };
}
```
Note: running-total key is now the unique entry id for all types (matches the material behaviour that already existed), so same-category same-day rows keep independent running totals.

- [ ] **Step 5: Run to verify pass** — `npx vitest --run components/operations/categoryView.test.ts` → PASS.
- [ ] **Step 6: Typecheck** — `npx tsc --noEmit` → clean.
- [ ] **Step 7: Commit**

```bash
git add components/operations/entryFormat.tsx components/operations/categoryView.ts components/operations/categoryView.test.ts
git commit -m "feat: pure category-summary, search, and grouping helpers"
```

---

### Task 5: Extract shared `EntryLogList` component

Extract the grouped-card rendering (including running total, day total, highlight/pulse, optimistic delete) out of `OperationDetailPageClient` into a reusable presentational client component driven by `buildGroupedRows`. This removes the visual-merge branch so expense/labour/machinery show independent editable cards.

**Files:**
- Create: `components/operations/EntryLogList.tsx`
- Modify: `app/app/sites/[id]/operations/[type]/OperationDetailPageClient.tsx`

- [ ] **Step 1: Create `EntryLogList.tsx`** — a client component with this contract:

```ts
type EntryLogListProps = {
  siteId: string;
  type: EntryType;
  entries: Entry[];          // already category/date/search-filtered by the caller
  sort: string;
  highlightId?: string | null;
  onDeleted?: () => void;    // caller can router.refresh()
};
```
Internals (move verbatim from `OperationDetailPageClient`):
  - Local `entries` state synced from props via `useEffect` (optimistic delete copy).
  - `useMemo(() => buildGroupedRows(entries, type, sort), [entries, type, sort])`.
  - The `pulse`/highlight `useEffect` (scroll into view + strip `highlight`/`date` params).
  - `handleDelete` (confirmDialog → optimistic remove → `requestJson` DELETE → rollback on error → `toast` → `onDeleted?.()`).
  - The JSX from the existing `<section className="space-y-4">…</section>` block (date groups, cards, running total, edit/delete buttons, empty state) — using `groupedRows`/`runningTotals` from the memo and `gridCategoryKey` for the running-total key.
Import `buildGroupedRows`, `gridCategoryKey` from the new/updated modules; keep using `renderEntrySummary`, `entryId`, `formatCurrency`, `formatDate`, `EntryTypeIcon` as before.

- [ ] **Step 2: Refactor `OperationDetailPageClient` to use it** — replace the inlined memo body + list `<section>` with `<EntryLogList siteId={siteId} type={type} entries={entries} sort={filters.sort} highlightId={highlightId} onDeleted={() => router.refresh()} />`. Keep header, filter bar, and (material) stage-total cards where they are. `totalSpend`/`visibleLogCount` for the header: compute via `buildGroupedRows(entries, type, filters.sort)` (or a lightweight `entries.reduce(entrySpend)`), so the header numbers are preserved.

- [ ] **Step 3: Behaviour check (manual, no DB writes)** — Run the app read-only against prod data; open an operation with existing multi-entry days for expense/labour/machinery. Verify each entry now shows as its **own editable card** (previously merged), running totals still ascend correctly, delete still works optimistically. Materials view unchanged.

Run: `npm run dev` then visit `/app/sites/<id>/operations/expense`.
Expected: independent cards; no console errors.

- [ ] **Step 4: Typecheck + existing tests** — `npx tsc --noEmit && npm test` → clean/green (no test regressions; `entryFormat.test.ts` still passes).

- [ ] **Step 5: Commit**

```bash
git add components/operations/EntryLogList.tsx "app/app/sites/[id]/operations/[type]/OperationDetailPageClient.tsx"
git commit -m "refactor: extract shared EntryLogList, show independent cards for all types"
```

---

### Task 6: Category grid + landing toggle

**Files:**
- Create: `components/operations/CategoryGrid.tsx`
- Modify: `app/app/sites/[id]/operations/[type]/OperationDetailPageClient.tsx`

- [ ] **Step 1: Create `CategoryGrid.tsx`** — presentational; takes `entries`, `type`, `siteId`. Calls `buildCategorySummaries(entries, type)`. Renders a responsive grid of tiles; each tile is a `next/link` to `/app/sites/${siteId}/operations/${type}/${encodeURIComponent(summary.key)}`. Tile content: `EntryTypeIcon`, `summary.key`, `${summary.count} entries`, `formatCurrency(summary.totalSpend)` (omit the spend line if `type === "incident"` — but incident never uses this grid), and `formatDate(summary.lastActivity)`. Empty state when no summaries. Follow existing `card-standard` / Tailwind classes used in `OperationDetailPageClient`.

- [ ] **Step 2: Add view toggle to `OperationDetailPageClient`** — add a `view` state initialised from a new `initialView` prop (default `"category"` for spend types, forced `"all"` for incident). Render a two-button segmented toggle ("By Category" / "All Logs") for spend types only. When `view === "category"`: render `<CategoryGrid entries={entries} type={type} siteId={siteId} />` and **hide the filter bar + stage cards + `EntryLogList`**. When `view === "all"`: render the existing filter bar + stage cards + `EntryLogList` (Task 5 result). Persist the toggle in the URL via `?view=all` / removing the param for category (use `router.replace`, no full navigation needed since data is already loaded).

- [ ] **Step 3: Wire `initialView` from the server page** — in `app/app/sites/[id]/operations/[type]/page.tsx`, read `getValue("view")`. **Regression guard (global search):** the global-search deep-link (`hitHref` in `components/search/useGlobalSearch.ts`) navigates to `/app/sites/${siteId}/operations/${type}?highlight=<id>&date=<d>`. The highlighted card lives in the All Logs list, so when `highlight` is present the page MUST open in All Logs, not the category grid. Pass:

```ts
const rawView = getValue("view");
const initialView =
  type === "incident" ? "all"
  : highlight ? "all"           // global-search deep-link → show the list so the row highlights
  : rawView === "all" ? "all"
  : "category";
```
Pass `initialView` to `OperationDetailPageClient`. (No new DB query — reuse the entries already fetched.)

- [ ] **Step 4: Manual check (read-only)** — open `/app/sites/<id>/operations/material`: category grid shows by default with correct counts/spend/last-activity; toggling to All Logs shows the existing list; `?view=all` deep-link opens All Logs. Incident page shows the flat list with no toggle.

- [ ] **Step 5: Typecheck** — `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add components/operations/CategoryGrid.tsx "app/app/sites/[id]/operations/[type]/OperationDetailPageClient.tsx" "app/app/sites/[id]/operations/[type]/page.tsx"
git commit -m "feat: category grid landing with By Category / All Logs toggle"
```

---

### Task 7: Category detail page (route + client)

**Files:**
- Create: `app/app/sites/[id]/operations/[type]/[category]/page.tsx`
- Create: `app/app/sites/[id]/operations/[type]/[category]/CategoryDetailPageClient.tsx`

- [ ] **Step 1: Server page** — mirror the parent page's auth/site/ownership/archived guards. Additional rules:
  - Auth: `safeGetSessionFromHeaders(await headers())`; if no session → `redirect("/auth/sign-in")`.
  - Allowed `type` for this route = spend types only (`material|expense|labour|machinery`). If `type` is `incident`, `all`, or unknown → `notFound()`.
  - Site: `getSiteById(siteId)`; if missing or `archivedAt` → `notFound()`.
  - Ownership: `if (!checkOwnership(session.user, site.supervisorId)) notFound();` — **`notFound()`, not a 403**, matching the parent page so site existence isn't leaked to non-owners.
  - Decode `category = decodeURIComponent(params.category)`. If empty → `notFound()`.
  - Read `from`/`to`/`workStage`/`sort`/`highlight` from `searchParams` (same helper as parent).
  - **Validity (must be independent of the date filter):** `const options = await getOperationCategoryOptions(type);` (export/reuse the helper from the parent page — move it to a shared module `app/app/sites/[id]/operations/[type]/categoryOptions.ts` and import in both, to avoid duplication). Then:

```ts
if (!options.includes(category)) {
  // Custom types may not be in the catalog options — confirm at least one entry
  // exists for this category IGNORING date/stage filters, so a date range that
  // excludes everything does not produce a false 404.
  const anyForCategory = await getEntriesBySite(siteId, type, { category, limit: 1 });
  if (anyForCategory.length === 0) notFound();
}
```
  - Fetch for display (with filters): `const entries = await getEntriesBySite(siteId, type, { from, to, category, workStage, sort, limit: 200 });` — the existing `category` filter maps to `workType`/`materialType`/`equipmentType`/`category` respectively (verified in `lib/db/queries/entries.ts`). Both queries are SELECT-only (read-only).
  - Render `<CategoryDetailPageClient site={...} siteId={siteId} type={type} category={category} initialEntries={serializeRow(entries)} initialFilters={{ from, to, workStage, sort }} highlightId={highlight} />`.

- [ ] **Step 2: Client component** — header (back-link to `/app/sites/${siteId}/operations/${type}`, category name, entry count, `formatCurrency` of total from `buildGroupedRows`). Controls:
  - **Search** input → local `search` state, debounced ~200ms; `const shown = initialEntries.filter((e) => entryMatchesSearch(e, type, search));`
  - **From/To/Sort** and (material only) **Work Stage** → same server round-trip pattern as `OperationDetailPageClient.applyFilters`, but push to the current category path: `/app/sites/${siteId}/operations/${type}/${encodeURIComponent(category)}?<params>`.
  - Body: `<EntryLogList siteId={siteId} type={type} entries={shown} sort={filters.sort} highlightId={highlightId} onDeleted={() => router.refresh()} />`.

- [ ] **Step 3: Manual check (read-only)** — click a tile → detail page lists only that category's logs, newest first; search filters instantly by remarks/amount; date range + sort round-trip; material stage filter works; unknown category URL 404s; empty valid category shows empty state.

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add "app/app/sites/[id]/operations/[type]/[category]" "app/app/sites/[id]/operations/[type]/categoryOptions.ts" "app/app/sites/[id]/operations/[type]/page.tsx"
git commit -m "feat: per-category operation detail page with search and filters"
```

---

### Task 8: Post-create/edit navigation to category detail

**Files:**
- Modify: `components/operations/categoryView.ts` (add `entrySuccessDestination`)
- Modify: `components/operations/categoryView.test.ts`
- Modify: `components/logs/EntryForm.tsx`

- [ ] **Step 1: Write the failing test**

```ts
// add to components/operations/categoryView.test.ts
import { entrySuccessDestination } from "./categoryView";

describe("entrySuccessDestination", () => {
  it("routes a created material to its category detail with highlight", () => {
    const entry = { materialEntryId: "m1", materialType: "Ready Mix" };
    expect(entrySuccessDestination(entry as any, "material", "s1")).toBe(
      "/app/sites/s1/operations/material/Ready%20Mix?highlight=m1",
    );
  });
  it("routes expense by category", () => {
    const entry = { expenseEntryId: "e1", category: "Materials" };
    expect(entrySuccessDestination(entry as any, "expense", "s1")).toBe(
      "/app/sites/s1/operations/expense/Materials?highlight=e1",
    );
  });
  it("falls back to site page when siteId missing", () => {
    expect(entrySuccessDestination({} as any, "expense", "")).toBe("/app/dashboard");
  });
});
```

- [ ] **Step 2: Run to verify fail** — `npx vitest --run components/operations/categoryView.test.ts` → FAIL (not exported).

- [ ] **Step 3: Implement**

```ts
// components/operations/categoryView.ts
export function entrySuccessDestination(entry: Entry, type: EntryType, siteId: string): string {
  if (!siteId) return "/app/dashboard";
  const id = entryId(entry, type);
  const category = gridCategoryKey(entry, type);
  const base = `/app/sites/${siteId}/operations/${type}/${encodeURIComponent(category)}`;
  return id ? `${base}?highlight=${id}` : base;
}
```

- [ ] **Step 4: Run to verify pass** — PASS.

- [ ] **Step 5: Wire into `EntryForm.tsx`** — the POST/PATCH success path has the created/updated row in `res.data`. Update `handleSubmit` so, for spend-type `kind` (`material|expense|labour|machinery`), it navigates via `entrySuccessDestination(res.data as Entry, kind, siteId)`. For `dynamic` keep `/app/sites/${siteId}` (or dashboard). For `incident` keep the existing `successDestination()` behaviour. Concretely, in the success branch:

```ts
    toast.success(isEdit ? "Entry updated" : "Entry created");
    if (onSuccess) { onSuccess(); return; }
    const spend = kind === "material" || kind === "expense" || kind === "labour" || kind === "machinery";
    if (spend && res.data) {
      router.push(entrySuccessDestination(res.data as Entry, kind, siteId ?? ""));
    } else {
      router.push(successDestination());
    }
```
Add the import: `import { entrySuccessDestination } from "@/components/operations/categoryView";` and `import type { Entry } from "@/components/operations/entryFormat";`. `handleDelete` keeps using `successDestination()` (deleting an entry should not target a possibly-now-empty category — returning to the operation list is correct).

- [ ] **Step 6: Manual check (read-only DB; creating a test entry writes to prod — do NOT create real entries on prod for testing)** — Verify the navigation logic by unit test (Step 4) and by code review. If a live create is unavoidable for QA, use a throwaway entry the user explicitly approves and deletes afterward. Otherwise rely on the unit test. Typecheck: `npx tsc --noEmit`.

- [ ] **Step 7: Commit**

```bash
git add components/operations/categoryView.ts components/operations/categoryView.test.ts components/logs/EntryForm.tsx
git commit -m "feat: land on category detail with highlight after create/edit"
```

---

## Plan self-review

- **Spec coverage:** Part 1 fix → Tasks 1–3. Independent cards for all types → Tasks 4–5. Category grid + toggle (default By Category) → Task 6. Category detail route + search + filters → Task 7. Post-create/edit nav + highlight → Task 8. Incident untouched → enforced in Tasks 6 (`initialView` forced `all`, no toggle) and 7 (route 404s incident).
- **Placeholders:** none — all code shown.
- **Type consistency:** `gridCategoryKey`, `buildCategorySummaries`, `buildGroupedRows`, `entryMatchesSearch`, `entrySuccessDestination` names used consistently across tasks; `EntryLogList` prop contract fixed in Task 5 and consumed unchanged in Tasks 6–7.
- **DB safety:** every test mocks `@/lib/db/client`; no test touches a real DB; manual checks are read-only.

---

## Production-readiness audit (findings + resolutions)

**Security**
- Category detail route replicates parent auth/ownership/archived guards; ownership failure returns `notFound()` (not 403) so site existence isn't leaked. *(baked into Task 7 Step 1)*
- `category` param flows into Drizzle `eq()` / parameterized queries — no SQL injection; a bad value simply matches nothing and 404s. Rendered as React text — no XSS.
- Search runs client-side over already-authorized, already-loaded entries — no new data exposure.

**Performance**
- `buildCategorySummaries` / `buildGroupedRows` are O(n), n ≤ 200 (existing limit). Category grid is derived from entries already fetched — no extra query on the landing page.
- Category detail issues 1 SELECT (plus, only for non-catalog categories, one `limit: 1` existence SELECT). All read-only.

**Edge cases resolved**
- **[Regression] Global-search highlight:** default category view would hide the highlighted row. Fixed — `highlight` param forces All Logs view (Task 6 Step 3).
- **[Regression] False 404 with date filter:** validity check now ignores date/stage filters (Task 7 Step 1), so filtering a valid category to an empty range shows an empty state, not 404.
- **Split-labour amount search:** haystack includes `masonSalaryAmount`/`helperSalaryAmount`/`peopleCount` (Task 4).
- **Null/missing category:** `gridCategoryKey` falls back to a per-type default; tile still renders.
- **Independent cards for all spend types:** `buildGroupedRows` drops the visual-merge branch, fixing the "same-category logs collapsed into one card" behaviour that Part 1 exposes for expense/labour/machinery. Running-total key is the unique entry id (already how material behaved).
- **Modal usage of `EntryForm`:** `onSuccess` path preserved (early return) — quick-add modals keep their existing behaviour; only full-page create/edit navigates to the category detail.

**Residual assumptions (verify during implementation, no code change expected)**
- `entryDate` returns `YYYY-MM-DD` for spend types (Postgres `date` column). `lastActivity` uses lexicographic max, which is correct for that format. If `serializeRow` ever emits a full timestamp, switch the comparison to `Date` parsing.
- Category values are not expected to contain `/`. If a custom type ever does, the single dynamic segment still round-trips via `encodeURIComponent`/`decodeURIComponent`, but confirm the host doesn't normalize `%2F`.

**No breaking changes**
- Incident operations untouched (no grid, no category route, nav unchanged).
- `all` combined view (`AllOperationsPageClient`) untouched.
- Delete still returns to the operation list via the retained `successDestination()`.
- All existing tests continue to pass (`entryFormat.test.ts`, route tests, etc.).
