# Work Stage Summary Page — Design

Date: 2026-09-05
Status: Approved for planning

## Problem

Work stage is stamped on entries across four tables but nothing in the UI
aggregates by it. A client asked to see "a summary of entries between
workstages" — in practice, *what has each phase of this building cost, and on
what*.

## What the data actually supports

`work_stage` is a `varchar(100)` on `labour_entries`, `material_entries`,
`machinery_entries` and `expense_entries` (schema.ts:214/244/271/295). Values
come from the managed catalog list "Work Stage" (`categories` → `subcategories`,
wired in lib/catalog/usageSources.ts:22-25). Every one of the four tables
already carries a `(site_id, work_stage)` index.

Three constraints fall out of the live data (site "Satheesh", read-only queries,
2026-09-05):

1. **Stages are labels, not a lifecycle.** No start/end dates, no per-site stage
   state. Date spans can only be *derived* from `min(date)`/`max(date)` of the
   entries carrying the label.
2. **Only 3 of 7 stages are in use.** A stage-A-vs-stage-B comparison picker
   would mostly show empty dropdowns. Rendering all stages at once *is* the
   comparison.
3. **The untagged bucket is material.** `work_stage` is required only on
   material. On Satheesh, 59 entries worth ₹2,77,020 — 25% of tracked spend,
   including the largest single labour item — carry no stage.

Reference snapshot (Satheesh, budget ₹40,00,000):

| Stage | Entries | Derived span | Material | Labour | Machinery | Expense | Total |
|---|---|---|---|---|---|---|---|
| Basement Level | 51 | Jun 20 → Aug 31 | 5,30,550 | 54,475 | 13,610 | 3,910 | 6,02,545 |
| Blockwork/Brickwork | 7 | Sep 1 → Sep 4 | 2,05,300 | 10,700 | — | — | 2,16,000 |
| Other | 3 | May 16 → Sep 3 | 4,000 | — | — | 200 | 4,200 |
| (untagged) | 59 | Feb 4 → Sep 2 | — | 2,45,100 | 30,000 | 1,920 | 2,77,020 |

## Decisions

- **Per-stage breakdown, not a comparison picker.** Driven by constraint 2.
- **No schema change.** `subcategories.sort_order` already exists
  (schema.ts:407) and is already populated for Work Stage, and
  lib/db/queries/catalogLists.ts:24 already orders by it. Construction sequence
  is available today.
- **Untagged is a first-class row, split two ways.** Rendered below a divider as
  two rows, because the gap has two unrelated causes (see "Why entries are
  untagged"): *Before Work Stage existed* (permanent, unfixable) and *Not
  tagged* (recent, fixable). Without these rows the page's column fails to sum
  to the site's tracked spend and reads as a bug; without the split it reads as
  "your team is sloppy" when most of it is the feature being younger than the
  data.
- **Derived date spans are labelled as derived.** They are not a tracked phase
  lifecycle and must not be presented as one.
- **Access matches sibling pages** — the existing `checkOwnership` guard
  (assigned supervisor + Admin), same as the operations pages.

## Why entries are untagged

Migration 0025_global_work_stage.sql added `work_stage` to labour, machinery and
expense on **2026-07-25**; before that only material had the column. That date
splits the gap cleanly (Satheesh):

| Logged | Entries | Untagged | Cause |
|---|---|---|---|
| Before 2026-07-25 | 41 | 41 (100%) | Column did not exist. Not fixable. |
| After 2026-07-25 | 43 | 18 (42%) | Field present but `required: false`. Skipped. |

Post-cutoff skip rate by type: labour 14/31 (45%), expense 4/10 (40%),
machinery 0/2, material 0/18. Material is at 100% coverage because it is the one
type where the field is `required: true`. The field is not hidden or hard to
reach — optionality alone explains the gap.

## Part 1: The summary page

### Route

`app/app/sites/[id]/stages/page.tsx`, a sibling of `operations/`. SSR, following
`app/app/sites/[id]/operations/[type]/page.tsx`: `safeGetSessionFromHeaders` →
redirect to sign-in → `getSiteById` → 404 on missing/archived →
`checkOwnership` → 404. Entry point is a "Stages" link on the site detail page.

### Query layer

New `lib/db/queries/stageSummary.ts`.

`getStageSummaryBySite(siteId)` — four aggregates, one per entry table, each
`GROUP BY work_stage`, returning count, `min(date)`, `max(date)` and summed
spend. Served by the existing `(site_id, work_stage)` indexes.

Labour spend reuses the existing SQL cost expression. Note it is currently a
**function-local** `const labourSpendExpr` at entries.ts:554, not an export — a
prerequisite step lifts it to a shared module-level export so both call sites
use one copy. The precedence rule (mason+helper split → stored `salary_amount` →
`people_count × wage_per_head`) already has three SQL copies guarded by a
fixture-parity test in entries.test.ts; a fourth copy would drift.

`getStageCompositionBySite(siteId, stage)` — drill-down. Material grouped by
`material_type` (quantity, unit, spend); labour grouped by `work_type` (head
count, spend). Fired on expand, not part of the initial payload.

### Assembly

A pure function stitches the four aggregate result sets onto the ordered catalog
list from `loadActiveCatalogNames("Work Stage")` (catalogLists.ts:13 — returns
names only, already ordered by `sort_order` then name, and cached 600s).
Display order follows that array's index. Stages with zero entries are omitted. Rows whose `work_stage` is NULL fold
into the untagged bucket. A `work_stage` value present on entries but absent
from the catalog (renamed or deactivated since) still renders, appended after
the ordered stages — it must never silently vanish, since its spend is real.

Keeping this stitch pure and separate from the SQL is what makes the ordering
and bucketing rules testable without a database.

### Page

Row per stage, in sequence: stage name, derived span, entry count, total spend,
percent of site budget, and a segmented bar splitting the total across material
/ labour / machinery / expense. Untagged below a divider. Expanding a row loads
the composition breakdown.

### Testing (Part 1)

- Unit tests on the stitch/order function with fixture rows: empty stages, a
  site where every entry is untagged, an entry stage missing from the catalog,
  and a site with zero entries.
- `describeDb` test for the aggregates against a seeded site, asserting that
  per-stage labour spend matches `labourSpend()` applied row-by-row. Run with
  `--testTimeout=30000` — one describeDb test flakes at the 5000ms default under
  parallel load.

## Part 2: Make Work Stage mandatory

Folded into this work so the untagged bucket stops growing.

### Changes

1. **components/logs/entryFieldRegistry.ts** — labour, machinery, expense:
   `required: false` → `true`, and remove `clearable: true`. `clearable` is what
   lets the edit form send `null` to un-tag (EntryForm.tsx:187); leaving it on
   would keep a hole open. `required` alone drives both the `*` marker and the
   submit block (EntryForm.validate.ts:35).
2. **lib/validation/schemas.ts, create schemas** — drop `.optional()` from
   `workStage` on `labourCommonCreateShape`, the machinery shape, and
   `expenseEntrySchema`, so a direct API POST cannot bypass the form.
3. **lib/validation/schemas.ts, update schemas** — drop `.nullable()` from
   `updateLabourEntrySchema` and `updateMachineryEntrySchema`.
   `updateExpenseEntrySchema` is derived via `expenseEntrySchema.partial()` and
   inherits the change automatically.

### The database column stays nullable

`ALTER TABLE ... SET NOT NULL` would fail outright: 253 existing rows are NULL
across all sites (labour 127/144, expense 120/127, machinery 6/8). Postgres
refuses and changes nothing, so the failure is safe — but enforcing at the
database level would require backfilling 253 rows with invented stage values.
Nobody knows which phase a February labour entry belonged to. **Enforcement is
form + API only.** No migration is part of this work.

### Legacy-edit exemption

Making the field required naively breaks editing old entries: a supervisor
opening a February labour entry to correct a wage would be blocked until they
guess a building phase from eight months ago. That yields either fabricated
phase data or an abandoned correction — the wage stays wrong.

So the requirement is enforced for **new entries only**. On the edit form, Work
Stage is not required when the entry both (a) predates the field and (b) has no
stage set. Concretely: `required` is computed per-render rather than read
straight off the registry, taking the entry's existing `workStage` and
`createdAt` into account. An entry that already has a stage can never be
un-tagged; an entry that never could have had one is left alone.

This is the only part of Part 2 that is more than a flag flip, and it is where
the tests should concentrate.

### Testing (Part 2)

- EntryForm.validate tests: required blocks submit on create for all three
  types; the legacy exemption permits save; an entry with an existing stage
  cannot be cleared.
- Route tests for POST /api/entries/{labour,machinery,expense}: missing
  `workStage` → 400.
- Route tests for PATCH: `workStage: null` → 400; omitting `workStage` on a
  legacy entry still succeeds (the PATCH route only validates fields present in
  the body, route.ts:101 — this must keep working).

## Known data issue (not fixed here)

`Blockwork/Brickwork` was added to the Work Stage catalog on 2026-09-01 and
received `sort_order = 6`, so it sorts *after* `Other` (5) despite being the
stage that follows `Basement Level` in practice. It also appears to duplicate
the unused `Brick Level` (1). Correcting this is a one-row UPDATE on production
subcategories, deliberately out of scope; it is fixable through the admin
catalog UI. Until then the page will display it last.

## Out of scope

- Backfilling the 253 pre-existing untagged rows.
- A `NOT NULL` database constraint on `work_stage`.
- Stage start/end lifecycle tracking.
- Cross-site stage benchmarking ("what does Basement Level usually cost us").
- Editing stage order from this page.
