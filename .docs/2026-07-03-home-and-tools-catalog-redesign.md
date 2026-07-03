# Home Screen & Tools Catalog Redesign

**Date:** 2026-07-03
**Scope:** `app/app/dashboard/DashboardPageClient.tsx`, `components/tools/ToolCatalogManager.tsx` (+ new sub-components)
**Type:** UI/UX redesign — no schema, no API changes

---

## 1. Problem Statement

### 1.1 Home screen
The dashboard has two structural problems:

1. **Redundancy.** An "Active Sites" stat card shows the count `4 LIVE`, then the exact same set of sites is re-listed in a "Recent Site Activity" table directly below. The count is just `sites.length` — it restates what the list already shows.
2. **Misleading affordance.** The stat card looks like a card but does nothing on tap. Users expect a stat that big to be actionable.
3. **Wasted data.** The dashboard already loads `currentProgress`, `currentPhase`, `status`, and `updatedAt` per site, but the table only renders name / location / status. No sense of progress or recency.

### 1.2 Tools catalog page
`ToolCatalogManager` → `ToolsTable`:

1. **Cramped add-form.** Name / Category / Opening-stock / Add-tool are crushed into one `flex-wrap` row inside a bordered box that dominates the top of the page. Poor rhythm, awkward wrapping on mid widths.
2. **Weak empty state.** Bare sentence `No tools yet. Add one above.` — no visual, no clear CTA.
3. **Flat list.** Table rows are `py-2`, no hover, no sticky header; `total` / `free` are plain numbers with no visual weight. No search / filter. No mobile card treatment (unlike `CatalogManager`, which has a proper mobile stacked-card pattern).

---

## 2. Solution

### 2.1 Home screen — "command center" with a merged Sites card

Decisions (confirmed with user):
- **Merge** the Active-Sites stat into the Sites card header. No separate KPI tile for sites, no `/app/sites` index (that route was deliberately removed — `app/app/sites/page.tsx` returns `notFound()`).
- Keep **Company Tools** as its own KPI tile — it links to `/app/tools`, a genuinely separate destination.
- Filter / search / show-all live **inside** the Sites card. Rows link to the existing `/app/sites/[id]` route.

Layout (single column on mobile; tools tile is full-width above the sites card):

```
┌ COMPANY TOOLS ─────────────────→┐   ← existing ToolSummaryTile (unchanged), role-gated
│  0            0 free · 0 deployed│
└──────────────────────────────────┘

┌ SITES ······················ 4 LIVE ┐
│ [All] [In Progress] [Blocked] [Done] 🔍  │   ← status filter chips + search toggle
│ ─────────────────────────────────── │
│ SHYAM        📍 Tvm      ● In Progress │
│              ▓▓▓▓▓▓░░░░ 62% · 2h ago   │
│ VALUATION…   📍 Tvm      ● In Progress │
│              ▓▓▓▓░░░░░░ 40% · 5h ago   │
│ …top 5 rows by updatedAt desc…       │
│ ─────────────────────────────────── │
│           Show all 12 sites          │   ← expands inline, no route change
└──────────────────────────────────────┘
```

Row anatomy:
- **Name** (bold, hover → sky-400), **location** with `MapPin` icon.
- **Status badge** reusing existing `badge-emerald` / `badge-amber` / `badge-sky` classes (In Progress / Blocked / Completed).
- **Progress bar** — thin track + fill sized to `currentProgress` (hidden if null). `tabular-nums` percent.
- **Last updated** — relative time from `updatedAt` (e.g. "2h ago"), computed client-side.

Interaction:
- **Filter chips**: `All | In Progress | Blocked | Completed`. Client-side filter over the already-loaded `sites` array. Active chip uses `bg-primary text-on-primary`.
- **Search**: icon button reveals an inline input; filters by name/location, case-insensitive.
- **Show all**: dashboard loads all sites already; render top 5 by default, toggle reveals the rest in place. Count reflects filtered set.
- Whole row is the tap target → `/app/sites/[id]` (keep existing `cursor-pointer` + hover).

Empty / filtered-empty state inside the card: short centered message ("No sites match" / "No active sites yet").

### 2.2 Tools catalog — rework layout + polish

Structure of `ToolsTable`:

```
┌ toolbar ───────────────────────────────────┐
│ [ + Add tool ]        [ 🔍 search ] [ ▼ cat ]│
└─────────────────────────────────────────────┘

  (empty)                     (populated)
┌─── dashed ───┐        Name    Code    Category  Total  Free  ⋯
│    🔧 wrench  │        ─────────────────────────────────────
│  No tools yet │        Manvatti MNV-01 Earthwork  12  ▓▓░ 8   ⋯
│  hint text…   │        Hammer   HMR-01 Hand tools  5  ▓▓▓ 5   ⋯
│ [ + Add tool ]│
└──────────────┘
```

Changes:
1. **Add-tool → modal.** Replace the inline `flex-wrap` add-form with a `+ Add tool` button that opens a new `ToolAddModal` (mirrors the shape of `CatalogAddModal`: overlay + focused card, Name / Category `<select>` / Opening-stock, submit calls the existing `createTool`). Same validation (`name.trim()` + `categoryId` required, opening stock floored ≥ 0). Same toast on success.
2. **Toolbar.** Left: `+ Add tool`. Right: search input (filters tools by name/code) + category filter `<select>` (reuse active categories). Client-side filtering over the loaded `tools` array.
3. **Empty state.** Dashed-border card, centered `Wrench` icon, heading "No tools yet", one line of hint, and a `+ Add tool` button that opens the same modal. Reuse for filtered-empty ("No tools match").
4. **Table polish (desktop, `md:` up).** `py-3` rows, `divide-y divide-outline-variant/40`, row `hover:bg-surface-container-low`, sticky header, `tabular-nums` on Total/Free, `code` rendered as a mono chip, and a small `free/total` mini-bar in the Free cell. Rename/Delete actions unchanged in behaviour.
5. **Mobile cards (`< md`).** Stacked cards matching `CatalogManager`'s mobile pattern: name + code chip, category, `Total N · Free N` line, and a `RowActionsMenu` (Rename / Delete) instead of inline buttons. Reuse the existing `RowActionsMenu` component.

Non-goals: no changes to `ToolCategoryManager`, tool APIs, `createTool`/`patchTool`/`deleteTool`, or the ledger/assignment flows.

---

## 3. Implementation Plan

Ordered, each task independently verifiable.

### Home screen

- [ ] **T1 — Extract `SiteRow`.** New component rendering one site row: name, location (`MapPin`), status badge, progress bar (conditional on `currentProgress`), relative last-updated. Pure props, links to `/app/sites/[id]`.
- [ ] **T2 — Relative-time helper.** Small `timeAgo(date)` util (or reuse if one exists — check `lib/utils`) for "2h ago". Handle < 1min, minutes, hours, days.
- [ ] **T3 — Build `SitesCard`.** Header with title + `N LIVE` stat, status filter chips (All / In Progress / Blocked / Completed), search toggle+input, list of top-5 filtered rows via `SiteRow`, "Show all N" inline toggle, and empty/filtered-empty message. All filtering client-side over `data.sites`.
- [ ] **T4 — Rewire `DashboardPageClient`.** Remove the standalone Active-Sites stat card and the old table section. Render `ToolSummaryTile` (when `showToolTile`) then `<SitesCard sites={…} />`, then `ArchivedSites` unchanged. Preserve motion entrance animations and `prefers-reduced-motion`.

### Tools catalog

- [ ] **T5 — Build `ToolAddModal`.** Overlay + card, Name / Category `<select>` / Opening-stock inputs, submit → existing `createTool`, success toast + `mutate` + close, disabled-while-busy. Model on `CatalogAddModal` structure and existing `create()` logic in `ToolsTable`.
- [ ] **T6 — Toolbar + client filtering.** In `ToolsTable`: `+ Add tool` button (opens modal), search input (name/code), category `<select>` filter. Derive `filtered` from `tools` + search + category state.
- [ ] **T7 — Empty state component.** Dashed card with `Wrench` icon, heading, hint, `+ Add tool` button. Used for both zero-tools and zero-matches.
- [ ] **T8 — Table polish (desktop).** Apply spacing/dividers/hover/sticky-header, mono code chip, `tabular-nums`, free/total mini-bar. Keep Rename/Delete behaviour identical.
- [ ] **T9 — Mobile cards.** `< md` stacked cards + `RowActionsMenu` (Rename / Delete). Hide desktop table on mobile, hide cards on desktop (match `CatalogManager`).

### Cross-cutting

- [ ] **T10 — Design-system compliance pass.** Verify against MASTER.md checklist: no emoji icons (Lucide only), `cursor-pointer` on all clickable, transitions 150–300ms, visible focus states, 4.5:1 contrast, `prefers-reduced-motion` respected, no mobile horizontal scroll.

---

## 4. Final Test / Acceptance

Manual verification once T1–T10 land (run `npm run dev`, and `npm run lint` for types):

**Home**
1. Dashboard shows **one** Sites card — no duplicate stat card. Header shows correct live count.
2. Rows show status badge + progress bar (where progress exists) + "Xh ago". No progress bar when `currentProgress` is null.
3. Filter chips filter the list client-side; count/empty message update. Search filters by name/location.
4. With > 5 sites, only 5 show; "Show all N" reveals the rest in place; no navigation to a dead `/app/sites` route.
5. Tapping a row opens `/app/sites/[id]`. Company Tools tile still renders (role-gated) and links to `/app/tools`.

**Tools catalog**
6. `+ Add tool` opens the modal; adding a tool creates it, toasts, closes, and the row appears. Validation matches old form (name + category required).
7. Empty state renders the dashed card + working Add button; zero-match search shows the filtered-empty variant.
8. Search + category filter narrow the list correctly.
9. Desktop table has hover, dividers, sticky header, mono code chip, free/total bar; Rename & Delete behave exactly as before (incl. 409 force-return path on Delete).
10. On a 375px viewport: stacked cards with overflow menu, no horizontal scroll.

**Both**
11. `npm run lint` (tsc) passes. Keyboard: all controls focusable with visible focus. `prefers-reduced-motion` disables entrance animations.
