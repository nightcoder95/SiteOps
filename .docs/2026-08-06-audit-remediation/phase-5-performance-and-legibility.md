# Phase 5 — Performance & legibility

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove a network round-trip from every API request, stop pulling a thousand unprojected rows for a list view, and make the app readable in sunlight.

**Architecture:** Three unrelated fixes with one thing in common — each is small, measurable, and independently revertable. F14 enables the rate limiter's in-memory cache. F15 projects list columns, drops a redundant full-page refresh, and adds pagination past the 200/type cap. F17 raises placeholder contrast and puts a floor under content text.

**Tech stack:** `@upstash/ratelimit` 2, drizzle-orm, Tailwind 4, Next 16.

**Covers audit findings:** F14, F15, F17.

**Independence:** this phase depends on nothing and blocks nothing. Run it whenever there is a gap. **One ordering constraint:** F14 touches `lib/rateLimit/`, which [Phase 7](phase-7-security-hardening.md)'s S3 and S4 also touch — do F14 first, or fold all three into whichever lands first.

---

## Global constraints

Read [README.md § Global constraints](README.md#global-constraints-apply-to-every-phase-every-task). Phase-specific:

- **`applyRateLimit` runs inside `withApi` for every route.** Any change here affects all 61 routes at once. Exempting by HTTP method is forbidden — `admin/export` is an expensive **GET**.
- **`guard.ts` already no-ops without Upstash env and outside production.** Preserve both. Do not make dev suddenly rate-limited.
- **Column projection changes the row type** returned by `getEntriesBySite`. Audit consumers before dropping anything.
- Run tests as `npm run test -- --testTimeout=30000`.

---

## Pre-flight

- [x] **P0.1** Clean tree, green baseline, recorded pass count.
- [ ] **P0.2** `git checkout -b phase-5-perf-and-legibility`.

---

## F14 — Kill the per-request Upstash round-trip

### Verified state

`lib/http/withApi.ts:39` calls `applyRateLimit` on every request. `lib/rateLimit/guard.ts:31` then does `await upstashRateLimit.limit(key)` — an Upstash **REST** round-trip. On serverless that RTT can rival the DB query it is protecting, and it is paid by trivial GETs like `material-units/resolve` and `forms/categories`.

`lib/rateLimit/upstash.ts` constructs the limiter with `redis`, `limiter`, and `analytics` — and **no `ephemeralCache`**. That option exists precisely for this: `@upstash/ratelimit` keeps an in-process `Map` of keys already known to be blocked (and, for sliding-window, recent state), so repeated requests in the same warm lambda skip the network entirely.

### Why the ephemeral cache and not an allowlist

The audit offers two options. **Do the ephemeral cache; do not build an allowlist.** An allowlist is a permanent security decision (which endpoints are cheap enough to under-protect?) that has to be re-litigated whenever a route changes cost — `admin/export` is the standing counter-example. The ephemeral cache is a one-line, zero-behaviour-change performance win with no security surface. If, after measuring, the RTT is still a problem, revisit — with numbers.

### Task 1 — Enable `ephemeralCache`

**Files:**
- Modify: `lib/rateLimit/upstash.ts`
- Create: `lib/rateLimit/upstash.test.ts`

- [x] **Step 1: Confirm the option name against the installed version**

```bash
grep -rn "ephemeralCache" node_modules/@upstash/ratelimit/dist/*.d.ts | head
```
The repo is on `@upstash/ratelimit ^2.0.6`. **Read the actual type declaration** before writing code — if the option is named or typed differently in this version, follow the declaration, not this doc.

- [x] **Step 2: Write the failing test**

Create `lib/rateLimit/upstash.test.ts`:

```ts
// Cases:
// 1. with UPSTASH_REDIS_REST_URL + _TOKEN set, upstashRateLimit is non-null and
//    was constructed with an ephemeralCache (a Map instance).
// 2. without the env vars, upstashRateLimit is null (unchanged dev behaviour).
// 3. the limiter config is otherwise unchanged: slidingWindow(60, "1 m"),
//    analytics true.
```
Case 3 is what stops this "optimisation" from quietly loosening the limit.

- [x] **Step 3: Implement**

```ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// A module-level Map shared by every request handled by this warm instance.
// @upstash/ratelimit consults it before going to Redis, so a burst from one
// user costs one REST round-trip instead of one per request. Bounded by the
// instance lifetime — a cold start starts empty, which is correct: the
// authoritative state always lives in Redis.
const ephemeralCache = new Map<string, number>();

export const upstashRateLimit =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(60, "1 m"),
        analytics: true,
        ephemeralCache,
      })
    : null;
```

**Match the declared type for the Map's value.** If the declaration says `Map<string, number>`, use that; if it says something else, use that. Do not cast.

- [x] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Verify the limit still bites**

The cache must not let a user exceed 60/min. With Upstash env configured against a scratch database:
```bash
for i in $(seq 1 70); do curl -s -o /dev/null -w "%{http_code}\n" -H "cookie: <session>" http://localhost:3000/api/forms/categories; done | sort | uniq -c
```
Expected: ~60× `200`, then `429`s. **If you never see a 429, the change broke rate limiting — revert immediately.**

- [ ] **Step 6: Measure the win**

With the dev server and Upstash configured, time 20 sequential requests to a cheap GET before and after. Record both numbers here:

| | p50 (ms) | p95 (ms) |
|---|---|---|
| before | | |
| after | | |

- [ ] **Step 7: Commit**
```bash
git add lib/rateLimit/upstash.ts lib/rateLimit/upstash.test.ts
git commit -m "perf(rate-limit): enable the ephemeral in-memory cache to skip the Upstash RTT"
```

---

## F15 — List-view projection, redundant refresh, pagination

### Verified state

- `getEntriesBySite`'s four fetchers use `db.select()` — i.e. `SELECT *`, including the `remarks` text column, for a card list that renders at most a line of it.
- `app/app/sites/[id]/operations/[type]/page.tsx:76,128` passes `limit: 200`; with `type === "all"` that is **five types × 200 = up to 1000 rows**, all unprojected.
- `AllOperationsPageClient.tsx:172` calls `router.refresh()` after an **already optimistic** delete.
- `:209-211` renders a hard-cap banner ("Showing the most recent 200 …") with no way to page past it.

### Task 2 — Remove the redundant `router.refresh()`

**Files:**
- Modify: `app/app/sites/[id]/operations/[type]/AllOperationsPageClient.tsx`

**The audit says "verify no server-derived totals depend on it". Verified — they do not:** `grandTotal`, `visibleLogCount` and `groupedRows` are all computed by a `useMemo` over the `rows` state (`:109`), which `handleDelete` has already updated optimistically (`:165`). So `router.refresh()` re-runs the full five-table SSR fetch to produce data the client already has.

**One thing does come from server props: `capped`** (`:49,58`), which drives the "Showing the most recent 200" banner. After deleting an entry from a capped type, the banner may be one row stale until the next navigation. That is acceptable — the banner is advisory (the code says so) and a full five-table refetch is a disproportionate price for it. Record the trade-off; do not silently ignore it.

- [x] **Step 1: Delete the call**

```ts
    toast.success("Entry deleted");
    // No router.refresh(): grandTotal / visibleLogCount / groupedRows are all
    // derived client-side from `rows`, which the optimistic update above has
    // already corrected. Refreshing re-ran the full five-table SSR fetch for
    // nothing. `capped` (the 200-row banner) is server-derived and may be one
    // row stale until the next navigation — accepted; it is advisory only.
```

- [ ] **Step 2: Verify**

- Delete an entry → it disappears, the header count decrements, the grand total drops by exactly that entry's spend, and the Network tab shows **no** RSC refetch.
- Force a delete failure → the row returns and the totals restore.
- Navigate away and back → counts still correct.

- [x] **Step 3: Check the sibling**

`components/operations/EntryLogList.tsx` calls `onDeleted?.()` instead of refreshing (`:110`). Trace what the parent does with that callback:
```bash
grep -rn "onDeleted" app components
```
If a parent responds by refreshing, apply the same analysis there: is anything it needs actually server-derived? Fix or leave it deliberately, and write down which.

- [ ] **Step 4: Commit**
```bash
git add "app/app/sites/[id]/operations/[type]/AllOperationsPageClient.tsx"
git commit -m "perf(operations): drop the redundant full refresh after an optimistic delete"
```

---

### Task 3 — Project list-view columns

**Files:**
- Modify: `lib/db/queries/entries.ts`

**Do this after Phase 3**, where the five clone fetchers became one descriptor-driven fetcher — projecting one function is far safer than projecting five.

**Audit consumers before dropping anything.** `renderEntrySummary` reads `remarks` for labour, material and machinery (`entryFormat.tsx:219,240,259`). Dropping it would blank those lines.

**Therefore: truncate, do not omit.** `left(remarks, 160)` keeps every consumer working while capping the payload — the summary renders one line anyway.

- [x] **Step 1: Inventory every field the list views read**

```bash
grep -rn "entry\.\|row\.primary\." components/operations/entryFormat.tsx components/operations/EntryLogList.tsx components/operations/categoryView.ts components/operations/allOperationsView.ts | grep -o "entry\.[a-zA-Z]*" | sort -u
```
Plus the fields `mapEntryToFormValues` needs — **but note the edit form loads a single entry via `getEntryById`, not via `getEntriesBySite`**, so the projection does not constrain it. Confirm that before relying on it.

Write the resulting field list into this doc. It is the projection.

- [x] **Step 2: Write the failing test**

In `lib/db/queries/entries.test.ts`:

```ts
// 1. every field the list views read is present on the returned rows
//    (assert key-by-key against the Step 1 inventory).
// 2. remarks longer than 160 chars come back truncated to 160.
// 3. remarks shorter than 160 come back intact.
// 4. null remarks stay null (not "").
// 5. the spend fields needed by entrySpend are present for all four spend types.
```

- [x] **Step 3: Implement**

In the descriptor-driven fetcher, replace `db.select()` with an explicit projection. The projection differs per type, so it belongs on the descriptor:

```ts
  // Columns the list views actually read. SELECT * pulled the full remarks
  // text for up to 1000 rows on the all-operations view; the card summary
  // renders one line, so remarks is truncated rather than omitted (dropping it
  // would blank the summary line for labour/material/machinery).
  listColumns: Record<string, PgColumn | SQL>;
```

Example for labour:
```ts
    listColumns: {
      labourEntryId: labourEntries.labourEntryId,
      siteId: labourEntries.siteId,
      date: labourEntries.date,
      workType: labourEntries.workType,
      workStage: labourEntries.workStage,
      peopleCount: labourEntries.peopleCount,
      wagePerHead: labourEntries.wagePerHead,
      salaryAmount: labourEntries.salaryAmount,
      masonCount: labourEntries.masonCount,
      masonSalaryAmount: labourEntries.masonSalaryAmount,
      helperCount: labourEntries.helperCount,
      helperSalaryAmount: labourEntries.helperSalaryAmount,
      createdBy: labourEntries.createdBy,
      createdAt: labourEntries.createdAt,
      remarks: sql<string | null>`left(${labourEntries.remarks}, 160)`,
    },
```

Fill the other four from the Step 1 inventory. **Include every column the view reads, including ones used only for permissions or keys** (`siteId`, `createdBy`) — a missing column becomes `undefined` at runtime with no type error if the consumer reads it off a `Record<string, any>` (which `Entry` is).

- [ ] **Step 4: Run everything that touches entries**
```bash
npm run test -- --testTimeout=30000 lib/db/queries components/operations
npm run lint
```

- [ ] **Step 5: Visual verification — this is where a missed column shows up**

Every list view, for every type:
- per-type operation pages (5),
- category detail pages,
- all-operations combined view,
- the site-detail recent entries block.

Check specifically: spend figures, work-stage chips, remarks lines, running totals, and the edit/delete buttons (they need the id and the ownership field).

- [ ] **Step 6: Measure**

For the all-operations view on a site with many entries, compare the RSC payload size before/after (DevTools → Network → the document/RSC response). Record:

| | payload |
|---|---|
| before | |
| after | |

- [ ] **Step 7: Commit**
```bash
git add lib/db/queries/entries.ts lib/entryTypes/server.ts lib/db/queries/entries.test.ts
git commit -m "perf(db): project list-view columns and truncate remarks in getEntriesBySite"
```

---

### Task 4 — Cursor pagination past the 200/type cap

**Files:**
- Modify: `lib/db/queries/entries.ts`
- Modify: `app/app/sites/[id]/operations/[type]/page.tsx`
- Modify: `app/app/sites/[id]/operations/[type]/AllOperationsPageClient.tsx`

**Scope honestly.** This is the largest task in the phase and the only one that adds new surface. If time is short, **ship Tasks 2 and 3 and defer this** — the cap banner is an honest UI, not a bug. Deferring is a legitimate outcome; shipping half a pagination scheme is not.

- [x] **Step 1: Decide the cursor**

The list is ordered by `(date DESC, created_at DESC)` — and there is a composite index on exactly `(site_id, date DESC, created_at DESC)`. So the cursor is `(date, createdAt, id)` and the predicate is a keyset comparison, **not** `OFFSET`. Offset pagination re-scans everything it skips and degrades exactly where this matters.

- [x] **Step 2: Write the failing test**

```ts
// 1. no cursor → the newest `limit` rows.
// 2. cursor = the last row of page 1 → page 2 starts at the next row, with no
//    overlap and no gap.
// 3. rows sharing the same date and created_at are disambiguated by id, so no
//    row is skipped or repeated (insert two rows with identical timestamps).
// 4. cursor past the end → empty array, not an error.
// 5. a malformed cursor → treated as no cursor (never a 500).
// 6. sort: "oldest" reverses the comparison correctly.
// 7. spend sort still works — NOTE: spend sorting happens in JS via
//    sortSpendRows AFTER the limit, so it only orders within a page. Assert
//    that documented limitation rather than pretending it is global.
```

Case 7 matters: keyset pagination and post-hoc JS sorting are incompatible. Either restrict pagination to the date sorts, or move spend sorting into SQL. **Pick one and write it down.** The cheap correct answer is: paginate only when `sort` is `newest`/`oldest`; keep the 200 cap with its banner for spend sort.

- [ ] **Step 3: Implement the query change**, then the page's "Load more" control, then wire it. Keep the cap banner for the non-paginated sorts.

- [ ] **Step 4: Verify** on a site with more than 200 entries of one type: load more appends without duplicates or gaps, the grand total updates, and the banner disappears once everything is loaded.

- [ ] **Step 5: Commit**
```bash
git commit -m "feat(operations): keyset pagination past the 200-entry per-type cap"
```

---

## F17 — Legibility for outdoor mobile users

### Verified state

- `.input-standard` (`app/globals.css:129-131`) uses `placeholder-slate-600` (`#475569`) on `#020617`. Contrast ≈ 3:1 — below WCAG AA's 4.5:1. Several inputs use the placeholder as their **only** label, so this is not decorative text.
- The class is also re-declared inline in `ToolsHub.tsx:154`, `ToolCatalogManager.tsx:131`, `UnitsManager.tsx:138`, `GlobalSearchOverlay.tsx:143`.
- **`text-[9px]` / `text-[10px]` appear at 98 call sites**, not the 26 the audit states. A blanket bump is a much larger visual change than the audit implies.

### Task 5 — Placeholder contrast

**Files:**
- Modify: `app/globals.css`
- Modify: the four files that re-declare the class inline

- [x] **Step 1: Change the token in one place**

`app/globals.css:130` — `placeholder-slate-600` → `placeholder-slate-400`.

`slate-400` is `#94a3b8`; against `#020617` that is ≈ 8:1 — comfortably above 4.5:1.

- [x] **Step 2: Verify the ratio rather than trusting the number**

Use any contrast checker with `#94a3b8` on `#020617`. **Record the measured value here:** ______ : 1. If it is below 4.5, go lighter (slate-300) and re-measure.

- [x] **Step 3: Fix the four inline copies**
```bash
grep -rn "placeholder-slate-600" app components
```
Change each to `placeholder-slate-400`. Better where the surrounding markup allows: delete the inline copy and use `.input-standard`.

- [x] **Step 4: Add the fence**

Append to `tests/ui/no-native-dialogs.test.ts` (created in Phase 1 — it already has the file walker) or a new `tests/ui/contrast.test.ts`:

```ts
test("no low-contrast placeholder utilities", () => {
  // slate-500 and darker on the #020617 surface falls under WCAG AA 4.5:1, and
  // several inputs use the placeholder as their only label.
  const offenders = files.filter((f) =>
    /placeholder-slate-(500|600|700|800|900)/.test(readFileSync(f, "utf8")),
  );
  expect(offenders.map((f) => path.relative(repoRoot, f))).toEqual([]);
});
```

- [ ] **Step 5: Visual check** — every form and the global search overlay, at 375 px, in bright ambient light if you can manage it. Placeholders must be comfortably readable without being mistaken for entered values.

- [ ] **Step 6: Commit**
```bash
git add app/globals.css components tests/ui
git commit -m "fix(a11y): raise placeholder contrast to meet WCAG AA"
```

---

### Task 6 — A 12 px floor for content text (the 8 user-critical sites only)

**Files:**
- Modify: `components/operations/EntryLogList.tsx`
- Modify: `app/app/sites/[id]/operations/[type]/AllOperationsPageClient.tsx`
- Modify: `app/globals.css` (document the rule)

**Scope discipline.** 98 call sites use `text-[9px]` / `text-[10px]`. Most are uppercase tracking-widest micro-labels that are decorative or redundant with adjacent content. **Fix the ones a user must actually read**; leave the rest. Bumping all 98 is a redesign, not a fix, and it will reflow tight card rows across the app.

The user-critical set, verified:

| Site | File:line | Why it matters |
|---|---|---|
| "Running total" label | `EntryLogList.tsx:151` | labels a number the supervisor is reading |
| Empty-state copy | `EntryLogList.tsx:186` | the only text on an otherwise blank screen |
| "Day total" label | `EntryLogList.tsx:~120` | labels a number |
| Type chips | `AllOperationsPageClient.tsx:~325` | the only thing distinguishing row types |
| Cap banner | `AllOperationsPageClient.tsx:209-211` | tells the user data is missing |
| "Logs" stat label | `AllOperationsPageClient.tsx:~197` | labels the header count |
| Work-stage chips | `entryFormat.tsx:203,230,251,270` | content, not decoration |
| Adjusted-range notice | `AllOperationsPageClient.tsx:~205` | tells the user their filter changed |

- [x] **Step 1: Bump each to `text-xs` (12 px)**, one file at a time.

- [ ] **Step 2: Check reflow at 375 px after each file.** Chips are the risk: a 12 px chip in a tight flex row can wrap and push the action buttons onto a second line. If a chip wraps badly, reduce its horizontal padding rather than reverting the size.

- [x] **Step 3: Document the rule** so the next person does not re-introduce 9 px content. Add near the top of `app/globals.css`:

```css
/* Type floor: 12px (text-xs) for anything a user must read; 14px+ for labels
   on interactive controls. 9-10px is reserved for decorative micro-labels that
   duplicate adjacent content. Field supervisors read this app outdoors on
   phones — see the 2026-07-17 audit, finding F17. */
```

- [ ] **Step 4: Commit**
```bash
git add components app/globals.css "app/app/sites/[id]/operations/[type]/AllOperationsPageClient.tsx"
git commit -m "fix(a11y): 12px floor for user-critical content text"
```

---

## Phase regression checklist

### Automated

- [x] `npm run lint` → exit 0.
- [x] `npm run test -- --testTimeout=30000` → green, pass count ≥ baseline + new tests.
- [ ] `npm run test:e2e` → green.
- [x] `grep -rn "placeholder-slate-[5-9]00" app components` → empty.
- [x] `grep -rn "router.refresh()" "app/app/sites/[id]/operations"` → empty.
- [ ] `grep -n "db.select()" lib/db/queries/entries.ts` → empty in the list path (`getEntryById` legitimately keeps `select()` — it feeds the edit form, which needs every column).

### Security

- [ ] **Rate limiting still enforces.** The 70-request burst test in Task 1 Step 5 produces 429s. **This is a blocking check — do not merge without running it.**
- [x] **The ephemeral cache cannot leak across users.** Keys are `user:${userId}:${pathname}` / `ip:${ip}:${pathname}` — per-identity by construction, and the cache is keyed by the same string. Confirm no key construction changed: `git diff main -- lib/rateLimit/guard.ts` → empty (this phase changes only `upstash.ts`).
- [x] **Dev is still unlimited.** With `NODE_ENV !== "production"`, `applyRateLimit` returns null before touching the limiter — unchanged.
- [x] **Projection did not widen exposure.** The projected columns are a **subset** of what `SELECT *` returned, so nothing new reaches the client. Confirm no column was added that was not previously returned: diff the Step 1 inventory against the table definitions.
- [x] **Truncation is server-side SQL, not client-side.** `left(remarks, 160)` means the full text never leaves the database for list views. That is a small privacy improvement — do not undo it by re-adding the full column "for convenience".
- [ ] **Pagination cursors carry no authorization.** If Task 4 shipped: the cursor is `(date, createdAt, id)` and the query still filters by `siteId` from the route, so a forged cursor cannot reach another site's rows. **Assert this with a test** — pass a cursor derived from another site's entry and confirm the result is still scoped to the requested site.

### Performance

- [ ] Cheap GET latency improved (Task 1 Step 6 numbers recorded).
- [ ] All-operations RSC payload smaller (Task 3 Step 6 numbers recorded).
- [ ] Delete on the all-operations view issues **one** DELETE and **zero** RSC refetches.
- [x] No new N+1: the fetcher still issues one query per type and `Promise.all`s them.
- [x] Cold start unaffected: `ephemeralCache` is an empty `Map` at module scope — no I/O, no measurable init cost.

### Visual / accessibility

- [x] Placeholder contrast measured at ≥ 4.5:1 and recorded.
- [ ] The eight bumped text sites render at 12 px with no layout breakage at 375 px, 390 px and 768 px.
- [ ] Card rows in `EntryLogList` and the type chips in the all-operations view do not wrap or overflow after the bump.
- [ ] Dark-only theme intact — no light-mode styles introduced.

---

## Deferred, deliberately

- **Task 4 (pagination)** may be dropped from this phase; the cap banner is honest UI. If dropped, note it here and open it separately.
- **The other 90 micro-text sites.** Decorative; they belong to a design pass, not a defect fix.
- **A rate-limit allowlist for cheap GETs.** Rejected in favour of the ephemeral cache — see the reasoning under F14.


---

## Execution record (2026-09-04)

Baseline before Phase 5: 636 passing / 12 skipped (94 files). After: **693 passing / 12 skipped
(98 files)** — +57 tests. `npm run lint` exit 0, `npm run build` succeeds.

Every task was driven test-first; each RED was observed before the implementation.

### F14 — corrected, not as planned

**The plan's premise does not hold for @upstash/ratelimit 2.0.8, and the task as written is a
no-op.** Verified in `node_modules/@upstash/ratelimit/dist/index.mjs`:

1. Line 757-760: when `ephemeralCache` is `undefined` the library **already creates an equivalent
   `Map` internally**. The limiter has had an ephemeral cache all along.
2. Lines 1267-1268: `slidingWindow` consults that cache **only via `isBlocked`** — it short-circuits
   identifiers already known to be over the limit. Every *allowed* request still pays the Redis
   round-trip. Only `Ratelimit.cachedFixedWindow` (line 1741+) serves allowed requests from local
   state.

So F14 as scoped cannot deliver the per-request RTT saving the audit claims. This was proved
empirically, not just by reading: the four cases in `lib/rateLimit/upstash.test.ts` all passed
against the **unmodified** `upstash.ts`.

What landed: `ephemeralCache` is now passed explicitly. That is a behaviour no-op today, kept
because it pins the intent against a library default that could change and gives the test something
real to fence. The comment in `upstash.ts` records the correction so the next reader does not
re-derive it. `lib/rateLimit/guard.ts` is byte-identical to `HEAD` (checked), so keys, the
production-only guard and the dev no-op are all untouched.

**Open decision for the owner:** the only route to the actual RTT win is switching to
`cachedFixedWindow`, which changes the limiting algorithm (fixed vs sliding window, with local
counting between Redis syncs). That is a security-relevant behaviour change the plan explicitly did
not authorise, so it was not made. It needs a deliberate call.

### F15 — Task 2, redundant refresh

Removed. `grandTotal` / `visibleLogCount` / `groupedRows` all derive from the `rows` state the
optimistic delete has already corrected. `capped` is server-derived and may be one row stale until
the next navigation — accepted, it is advisory. `tests/ui/optimistic-delete.test.ts` fences it.

**Step 3, the siblings — deliberately left alone.** `OperationDetailPageClient:301` and
`CategoryDetailPageClient:212` both answer `onDeleted` with `router.refresh()`, and they **must**:
their delete lives inside `EntryLogList`, which keeps its own *local* working copy of the rows
(`EntryLogList.tsx:45-49`). The parent's `entries` state is never updated by the delete, so its
`totalSpend`, `visibleLogCount`, `stageTotals` and `CategoryGrid` would all stay stale. Removing
their refresh would leave wrong money on screen. Recorded in the fence test's header comment.

### F15 — Task 3, projection

`listColumns` is now descriptor data (`lib/entryTypes/server.ts`), and `getEntriesBySite` selects it
instead of `SELECT *`. Dropped per type: the `*Mode` / `*Enum` / `*CustomId` selector columns,
`unitMasterId` / `unitCustomId`, `durationEstimate`, and `updatedAt` — confirmed by grep that no
list-view consumer reads any of them. `remarks` is truncated with `left(remarks, 160)` rather than
omitted, since `renderEntrySummary` draws it for labour/material/machinery.

`id` (the identity column) is kept for every type: `AdminExpensesPageClient` uses `entry.id` as its
React key, and it is the keyset tiebreaker. `getEntryById` keeps `SELECT *` — verified that the edit
form loads through it (`app/app/logs/[entryId]/page.tsx:40`), so the projection does not constrain
the form.

Two test layers: a pure spec test asserting the projection is exactly the inventory (it fails both
if a field is dropped **and** if the projection re-widens), and a DB test in a rolled-back
transaction proving the truncation semantics — >160 capped, <160 intact, null stays null, and every
projected key present.

### F15 — Task 4, pagination (shipped, not deferred)

Keyset, not OFFSET. Order targets are now `(date, created_at, id)` — `id` was added as the final
tiebreaker, without which a page boundary inside a group of rows sharing a timestamp skips or
repeats rows.

**A design defect in the plan's cursor was found and fixed.** The plan specifies a cursor of
`(date, createdAt, id)` carried in the token. That is unsound here: `created_at` is a
microsecond-precision timestamp, but any cursor that has been through JSON has been through a JS
`Date` and lost everything below the millisecond. The truncated value compares as *less* than the
row's real timestamp, so under `sort=oldest` the boundary row is re-emitted — caught by the
"reverses the comparison" test, which failed with a duplicated id before the fix.

The cursor therefore carries **only the boundary row's id**, and the predicate reads the exact
`(date, created_at)` back from that row inside the query. The lookup is scoped to the same `siteId`
as the outer query, so a cursor forged from another site's row finds nothing and yields the first
page — it can neither widen the result set nor confirm a foreign id exists. An unknown id is guarded
with `not exists (…) or …` so it means "first page", not "empty page".

Spend sorts: `sortSpendRows` runs in JS *after* the limit, so spend order is per-page only and a
keyset boundary is meaningless. `isPaginatedSort` returns false for them; the cursor is ignored and
the 200 cap keeps its banner, with the copy changed to say "sort by date to load more".

HTTP surface: `/api/sites/[id]/entries` gained `after=<id>`. It is a UI continuation token, so a
malformed or non-positive value falls back to the first page rather than a 400. The response
envelope is unchanged (still the bare array), so `AdminExpensesPageClient` is unaffected.

UI: the cap banner in the all-operations view now carries a "Load more" button. It issues one
request per still-capped type, continuing from that type's last loaded row; a short page marks that
type exhausted and drops it from the banner. `mergeLoadedRows` dedupes by type+id — not cosmetic,
since the grand total is a sum over `rows` and a duplicate would inflate the money on screen.

### F17 — contrast and type floor

Measured rather than assumed (WCAG 2.1 relative luminance against the `#020617` surface):

| token | hex | ratio | AA 4.5:1 |
|---|---|---|---|
| slate-600 | `#475569` | **2.66:1** | fails |
| slate-500 | `#64748b` | **4.24:1** | fails |
| slate-400 | `#94a3b8` | **7.87:1** | passes |
| slate-300 | `#cbd5e1` | 13.59:1 | passes |

Two corrections to the plan's inventory:

1. slate-500 also fails AA (4.24:1) — three of the "four inline copies" were slate-500, not
   slate-600, so they were failing too.
2. The plan's grep (`placeholder-slate-600`) misses the `placeholder:text-slate-*` variant.
   `GlobalSearchOverlay.tsx:168` used it, and the fence caught a **sixth** site the plan does not
   list at all: `components/data-export/DataExportPanel.tsx:180`. All six are now slate-400.

Type floor: the eight user-critical sites are at `text-xs`, plus the "Day total" / empty-state /
row-type-chip equivalents in the all-operations view, which are the same content as their
`EntryLogList` counterparts and were left inconsistent by the plan's list. The other ~90 decorative
micro-labels are untouched, per the plan's scope discipline. The rule is documented at the top of
`app/globals.css`, and `tests/ui/contrast.test.ts` fences both halves by element content rather than
line number.

### Not verified in this pass — needs a running app

- **The 70-request burst test (Task 1 Step 5) — the plan marks this a blocking check.** It needs a
  deployed/production-mode app with Upstash env against a scratch database. Note the change is a
  no-op by construction (see F14 above), and `guard.ts` is unchanged, so the limit logic is
  byte-identical to what is running today — but the check itself was not run.
- **Latency and RSC-payload measurements (Task 1 Step 6, Task 3 Step 6).** Both tables are still
  empty. The F14 number would be ~zero for the reason recorded above.
- **All visual checks**: the 375/390/768 px reflow pass after the type bump, chip wrapping, the
  placeholder legibility pass, and the delete-issues-no-RSC-refetch check in the Network tab.
- **"Load more" against a site with more than 200 entries of one type.** The keyset query itself is
  covered by the DB tests (no overlap, no gap, ties, past-the-end, oldest, forged cursor); what is
  unverified is the end-to-end button behaviour on real data.
- **`npm run test:e2e`** — still red for the pre-existing Phase 3 reason: `e2e/route-migration.spec.ts`
  imports `betterAuthUsers` from `@/lib/db/schema`, which does not export it. Unrelated to this phase.

### Database

No schema change, and nothing was written to the production database. Every DB-backed test added
here runs inside `withRollback`. One earlier draft of the pagination test seeded through the shared
pool instead; it was rewritten transactionally and the database was checked afterwards — zero
leftover rows.
