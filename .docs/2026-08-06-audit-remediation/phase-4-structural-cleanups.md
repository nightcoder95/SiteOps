# Phase 4 — Structural cleanups

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give three tangled areas a real seam — the catalog review flow, the approvals page, and the module boundary between client components and the DB layer — and stop nine pages from showing "Loading…" where they could render data.

**Architecture:** Four independent workstreams. F11 extracts a parameterised `lib/catalog/review.ts` from two 150-line twin routes. F12 splits a 337-line component into three feature components plus a layout shell. F13 relocates the type vocabulary and the pure unit helpers out of `lib/db/queries/*` behind a re-export shim. F16 converts client-only pages to server components that pass `initial*` props, using the pattern `dashboard/page.tsx` already proves.

**Tech stack:** Next 16 App Router (server components), React 19 (`useOptimistic`), SWR 2 (`fallbackData`), drizzle-orm, vitest 3.

**Covers audit findings:** F11, F12, F13, F16.

---

## Global constraints

Read [README.md § Global constraints](README.md#global-constraints-apply-to-every-phase-every-task). Phase-specific:

- **`tests/migration/no-src-imports.test.ts` must stay green** through every file move (F13). It walks `app/`, `components/`, `lib/` and asserts no `src/` imports; it does not enumerate paths, so moves inside those roots are safe — but run it after each move anyway.
- **Server components must use header-based auth** (`lib/auth/session.ts`), not the client session context. The nine pages being converted read auth client-side today; the server versions cannot.
- **Approval actions must keep exact endpoints and verbs.** `app/api/requests/field/[id]/route.test.ts` and `requests/resource/[id]/route.test.ts` pin them.
- Run tests as `npm run test -- --testTimeout=30000`.

---

## Ordering within this phase

1. **F13 first** (smallest, unblocks nothing but is blocked by nothing, and Phase 3 already moved `EntryType`).
2. **F11** (independent).
3. **F12** (approvals split).
4. **F16 last**, and **`admin/approvals` is converted only after F12 lands** — converting a 337-line client component to SSR before splitting it is strictly harder.

---

## Pre-flight

- [x] **P0.1** Phase 3 merged. Verify: `ls lib/entryTypes/` shows `server.ts` and `client.ts`, and `grep -n "export type { EntryType" lib/db/queries/entries.ts` shows the re-export shim.
- [x] **P0.2** Clean tree, green baseline, recorded pass count.
- [x] **P0.3** `git checkout -b phase-4-structural-cleanups`.

---

## F13 — Close the `lib/db/queries` seam leak

### What is actually true (verified 2026-08-06 — the audit overstates this one)

`lib/db/queries/materialUnits.ts` opens with:
```
// Pure, client-safe unit helpers. The DB-backed rule lookup lives in
// ./materialUnitRule (server-only) so this module can be imported by client
// components (e.g. UnitSelect) without pulling in the database client.
```
and imports nothing DB-related. So `UnitSelect` importing `dedupeUnitOptionsByName` / `displayUnitName` from it is **not** dragging Drizzle into the client bundle today.

What remains is a **locality and naming** defect: a client-safe module sits under a `db/queries/` path, so the next person to add a DB import to it silently breaks every client that imports it — with no test to catch it. This is a fence-before-someone-falls-in task, not an emergency. Scope it accordingly and do not gold-plate.

`EntryType` and `MaterialWorkStage` already moved to `lib/types/entry.ts` in Phase 3.

### Task 1 — Relocate the pure unit helpers

**Files:**
- Modify: `lib/catalog/units.ts` (destination — it already exists and owns catalog unit concepts)
- Modify: `lib/db/queries/materialUnits.ts` (becomes a re-export shim, then is emptied)
- Modify: `components/logs/UnitSelect.tsx`, `components/logs/EntryForm.tsx`, and any other importer

**Interfaces:**
- Produces: `displayUnitName`, `dedupeUnitOptionsByName`, `computeMaterialUnitRule`, `unitNameMatchesAllowed`, `type MaterialUnitRule` — all from `@/lib/catalog/units`.

- [x] **Step 1: Find every importer**
```bash
grep -rn "db/queries/materialUnits" app components lib --include="*.ts" --include="*.tsx"
```
Write the list down. Expect `components/logs/UnitSelect.tsx`, `components/logs/EntryForm.tsx` (type-only), `lib/db/queries/materialUnitRule.ts`, `lib/services/entries.ts` (added in Phase 1), the two test files, and the entry routes.

- [x] **Step 2: Move the code, leave a shim**

Move the entire contents of `lib/db/queries/materialUnits.ts` into `lib/catalog/units.ts` (append; keep that file's existing exports). Then replace `lib/db/queries/materialUnits.ts` with:

```ts
// Moved to lib/catalog/units.ts — these helpers are pure and client-safe, and
// living under db/queries invited a future DB import that would have broken
// every client importing them. Re-exported here for one release so the move
// lands without a 12-file import churn in the same commit.
export {
  computeMaterialUnitRule,
  dedupeUnitOptionsByName,
  displayUnitName,
  unitNameMatchesAllowed,
} from "@/lib/catalog/units";
export type { MaterialUnitRule } from "@/lib/catalog/units";
```

- [x] **Step 3: Run — everything green, nothing changed**
```bash
npm run lint && npm run test -- --testTimeout=30000
```
Existing `lib/db/queries/materialUnits.test.ts` still passes through the shim. That is the proof the move is behaviour-neutral.

- [x] **Step 4: Commit the move alone**
```bash
git add lib/catalog/units.ts lib/db/queries/materialUnits.ts
git commit -m "refactor(catalog): move pure unit helpers out of lib/db/queries"
```

- [x] **Step 5: Update every importer to the new path**

Change each file from the Step 1 list to import from `@/lib/catalog/units`. Also move the test: `git mv lib/db/queries/materialUnits.test.ts lib/catalog/materialUnits.test.ts` and fix its import.

- [x] **Step 6: Delete the shim**
```bash
rm lib/db/queries/materialUnits.ts
npm run lint && npm run test -- --testTimeout=30000
```
`tsc` finds any importer you missed.

- [x] **Step 7: Add the fence that makes this stick**

Append to `tests/migration/no-src-imports.test.ts` (it already has the file-walking helper):

```ts
test("client components do not import runtime values from lib/db/queries", () => {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const files = ['components', 'app'].flatMap((part) => walkFiles(path.join(repoRoot, part)));

  const offenders: string[] = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    // Only client components matter — server components legitimately query.
    if (!/^\s*['"]use client['"]/m.test(source)) continue;
    for (const line of source.split('\n')) {
      // `import type { … } from '@/lib/db/queries/…'` is erased at compile time
      // and is fine; a value import pulls the Drizzle layer into the bundle.
      if (!/from\s+['"]@\/lib\/db\/queries\//.test(line)) continue;
      if (/^\s*import\s+type\s/.test(line)) continue;
      if (/^\s*export\s+type\s/.test(line)) continue;
      offenders.push(`${path.relative(repoRoot, file)}: ${line.trim()}`);
    }
  }

  expect(offenders).toEqual([]);
});
```

Run it. If it reports offenders beyond what you just fixed, fix those too — they are the same class of bug.

- [x] **Step 8: Commit**
```bash
git add -A
git commit -m "refactor(catalog): point all importers at lib/catalog/units and fence the db/queries seam"
```

---

## F11 — Extract the catalog review flow

### Verified duplication

- `resolveReviewSiteId` is **byte-for-byte identical** in `app/api/forms/categories/route.ts:24-50` and `app/api/forms/subcategories/route.ts:33-59`.
- The "requiresReview → notify admins + insert a `fieldRequests` row" block and the "customFields/remarks → `fieldRequests` rows" block are the same logic with different noun strings.
- The `similar/route.ts` pair differs only in table and one schema field (38 and 43 lines).
- Route sizes: categories 227, subcategories 224.

### Correction to the audit's guardrail

A.1 says "the notify-admins step inserts notifications + a `fieldRequests` row inside the same transaction as the category insert — keep transactional boundaries identical." **There is no transaction.** Verified at `categories/route.ts:139-175`: the category insert, the notification fan-out (wrapped in `runNonCritical`, i.e. fire-and-forget) and the `fieldRequests` insert are three sequential, independent statements. The correct instruction is: **do not add a transaction as a side effect of extraction** (that is a behaviour change with its own risk profile), and **do not remove the `runNonCritical` wrapper** (notifications must never fail a write).

### Task 2 — Characterise the categories POST route first

**Files:**
- Create: `app/api/forms/categories/route.test.ts`

**This route has no test.** Extraction without one is a guess.

- [x] **Step 1: Copy the scaffolding** from `app/api/forms/subcategories/[id]/route.test.ts` (nearest sibling with a test).

- [x] **Step 2: Write cases pinning today's behaviour**

```ts
// 1. auto-approved path: a clearly novel name → 201, body includes
//    flaggedForReview: false, no fieldRequests row inserted for review,
//    invalidateCategoryListCache called.
// 2. review-required path: a name similar to an existing category →
//    201 with flaggedForReview: true; admins notified via runNonCritical with
//    event name "category_review_notification_failed"; ONE fieldRequests row
//    inserted with proposedName `[Category Review] <name>`, fieldType "Text",
//    status "Pending".
// 3. review required but resolveReviewSiteId finds no site → NO fieldRequests
//    row is inserted, and the response is still 201. (Silent skip is current
//    behaviour — pin it.)
// 4. siteId present + customFields → one fieldRequests row per non-blank label,
//    proposedName "<label> (<unit>)" when a unit is given, "<label>" otherwise.
// 5. siteId present + remarks → one row with proposedName "Remarks: <text>".
// 6. customFields with a blank label are filtered out.
// 7. no siteId → neither customFields nor remarks produce rows.
// 8. insert returns nothing → 500 INTERNAL_ERROR "Category creation failed".
// 9. unauthenticated → guard's code/status.
```

Case 3 is the one most likely to be broken by a careless extraction.

- [x] **Step 3: Run against the unmodified route — expect all PASS.** Fix the test, not the route, until green.

- [x] **Step 4: Commit**
```bash
git add app/api/forms/categories/route.test.ts
git commit -m "test(api): characterise the categories POST route before extraction"
```

---

### Task 3 — Extract `lib/catalog/review.ts`

**Files:**
- Create: `lib/catalog/review.ts`
- Create: `lib/catalog/review.test.ts`
- Modify: `app/api/forms/categories/route.ts`
- Modify: `app/api/forms/subcategories/route.ts`

**Interfaces:**
- Produces:
  ```ts
  export async function resolveReviewSiteId(
    preferredSiteId: string | undefined,
    sessionUserId: string,
    role: "Admin" | "Supervisor",
  ): Promise<string | null>;

  export type ReviewNoun = "category" | "subcategory";

  export async function submitForReview(input: {
    requestId: string;
    noun: ReviewNoun;
    name: string;
    categoryId: string;
    subcategoryId: string | null;
    preferredSiteId: string | undefined;
    sessionUserId: string;
    role: "Admin" | "Supervisor";
  }): Promise<void>;

  export function buildFieldRequestRows(input: {
    siteId: string;
    categoryId: string;
    subcategoryId: string | null;
    requestedBy: string;
    customFields?: Array<{ label: string; unit?: string | null; fieldType: string }>;
    remarks?: string | null;
  }): Array<Record<string, unknown>>;
  ```

- [x] **Step 1: Diff the two `resolveReviewSiteId` bodies to confirm they are identical**
```bash
diff <(sed -n '24,50p' app/api/forms/categories/route.ts) <(sed -n '33,59p' app/api/forms/subcategories/route.ts)
```
Expected: no output. **If there is output, they have drifted** — record the difference, decide which is correct, and note the decision in the commit message.

- [x] **Step 2: Write the failing test**

Create `lib/catalog/review.test.ts`:

```ts
// resolveReviewSiteId cases:
//  1. preferredSiteId given and the site is active → returns it.
//  2. preferredSiteId given but the site is archived → falls through.
//  3. preferredSiteId given but the site does not exist → falls through.
//  4. no preferred, role has site:read_all → first active site, any supervisor.
//  5. no preferred, role lacks it → first active site SUPERVISED BY the user.
//  6. nothing matches → null.
//
// buildFieldRequestRows cases:
//  7. custom fields with a unit → proposedName "Label (Unit)".
//  8. custom fields without a unit → proposedName "Label".
//  9. blank labels filtered out.
// 10. remarks → one row "Remarks: <text>", fieldType "Text".
// 11. neither → empty array.
// 12. every row carries status "Pending" and the passed siteId/categoryId/requestedBy.
//
// submitForReview cases (mock notifications + db):
// 13. notifies every admin with copy containing the noun, and inserts one
//     fieldRequests row with proposedName "[Category Review] <name>" for
//     noun "category" / "[Subcategory Review] <name>" for "subcategory"
//     — verify the ACTUAL current strings first; do not invent them.
// 14. no review site resolved → no insert, no throw.
// 15. notification failure does not throw (runNonCritical semantics).
```

**Before writing case 13**, read the exact strings in both routes and reproduce them:
```bash
grep -n "Review\]" app/api/forms/categories/route.ts app/api/forms/subcategories/route.ts
grep -n "needs review\|flagged for admin review" app/api/forms/categories/route.ts app/api/forms/subcategories/route.ts
```
These strings reach users in notifications. Parameterising them by noun is fine; **changing them is not**.

- [x] **Step 3: Run — expect FAIL.**

- [x] **Step 4: Implement `lib/catalog/review.ts`**

Move `resolveReviewSiteId` verbatim. Build `submitForReview` and `buildFieldRequestRows` by lifting the existing blocks and replacing only the noun-dependent strings with values from a small config:

```ts
const NOUN_CONFIG = {
  category: {
    // Copy verbatim from app/api/forms/categories/route.ts — these strings are
    // user-visible in notifications and in the fieldRequests list.
    reviewPrefix: "[Category Review] ",
    notificationTitle: "Category needs review",
    notificationBody: (name: string) =>
      `A similar category "${name}" was created and flagged for admin review.`,
    nonCriticalEvent: "category_review_notification_failed",
  },
  subcategory: {
    // …copy verbatim from app/api/forms/subcategories/route.ts…
  },
} as const;
```

Fill the subcategory half from the real file; do not assume symmetry.

- [x] **Step 5: Run — expect PASS.**

- [x] **Step 6: Rewire the categories route**

Replace its local `resolveReviewSiteId` and the two blocks with calls. Then run the characterisation test from Task 2 — **byte-identical results required.**

```bash
npm run test -- --testTimeout=30000 app/api/forms/categories/route.test.ts
```

- [x] **Step 7: Rewire the subcategories route**

Same. Run `app/api/forms/subcategories/[id]/route.test.ts` plus a manual check of the create flow from `CatalogManager` (create an option with a similar name → the review path fires and an admin notification appears).

- [x] **Step 8: Measure**
```bash
wc -l app/api/forms/categories/route.ts app/api/forms/subcategories/route.ts
```
Expect both materially below their current 227 / 224.

- [x] **Step 9: Commit**
```bash
git add lib/catalog/review.ts lib/catalog/review.test.ts app/api/forms/categories/route.ts app/api/forms/subcategories/route.ts
git commit -m "refactor(catalog): extract shared review flow from the categories/subcategories routes"
```

---

### Task 4 — Collapse the `similar` route twins

**Files:**
- Modify: `app/api/forms/categories/similar/route.ts`
- Modify: `app/api/forms/subcategories/similar/route.ts`
- Modify: `lib/catalog/review.ts`

These are 38 and 43 lines differing in table and one schema field.

- [x] **Step 1: Diff them**
```bash
diff app/api/forms/categories/similar/route.ts app/api/forms/subcategories/similar/route.ts
```
Read the actual difference before writing anything.

- [x] **Step 2: Extract a shared `checkSimilarNames({ table, nameColumn, scopeColumn?, scopeValue?, candidate })`** into `lib/catalog/review.ts`, returning the same shape both routes currently return.

- [x] **Step 3: Add unit tests** for the shared function covering: exact match, near match above the similarity threshold, below-threshold non-match, empty candidate list, and the scoped variant (subcategories are scoped by `categoryId`; categories are not).

- [x] **Step 4: Rewire both routes; each should shrink to ~15 lines.**

- [ ] **Step 5: Manual check** — the `CategoryPicker` similarity hint still appears while typing a near-duplicate, and still does **not** block submit.

- [x] **Step 6: Commit**
```bash
git add lib/catalog/review.ts app/api/forms/*/similar/route.ts
git commit -m "refactor(catalog): single similarity check behind the two similar routes"
```

---

## F12 — Split the approvals page

### Verified state

`app/app/admin/approvals/page.tsx` is 337 lines: **8** `useState` (`:48-55`), **3** `useOptimistic` (`:57-77`), and ~9 raw `requestJson` calls managing four domains (resource requests, field requests, transfers, category approvals) in one function. It hand-rolls fetch state instead of the app-standard `useApiResult` (`lib/http/useApiQuery.ts:43`). It also diverges visually: Material-compat tokens (`on-surface`, `surface-container`) and ~32 px buttons against the app-wide sky/slate `.btn-primary` 44–48 px vocabulary.

(The audit says 9 `useState` + 4 `useOptimistic`; the structural argument is unaffected.)

### Task 5 — Extract `<ResourceRequests/>`

**Files:**
- Create: `app/app/admin/approvals/ResourceRequests.tsx`
- Modify: `app/app/admin/approvals/page.tsx`

**Method — one domain at a time, verbatim first.** Move the state, the fetch, the optimistic reducer and the JSX for **one** domain into its own component **without changing any of them**. Simplify only after it is isolated and green. Rewriting while moving is how approval logic silently changes.

- [x] **Step 1: Move it verbatim**

Create the component with its own `useApiResult<ResourceRequest[]>('/api/requests/resource')`, its own `useOptimistic`, and the `reviewResource` handler copied character-for-character (endpoint, method, body, toast copy, optimistic transition). Render it from `page.tsx` in place of the inline block.

**`useApiResult` returns the `ClientResult` envelope**, not the bare data — match how `app/app/requests/field/page.tsx` consumes it. Read that file first:
```bash
grep -n "useApiResult\|\.ok\|\.data" app/app/requests/field/page.tsx | head -20
```

- [x] **Step 2: Verify the endpoint and verb are unchanged**
```bash
grep -n "requests/resource" app/app/admin/approvals/ResourceRequests.tsx
```
Must be `PATCH`/`POST` exactly as before — `app/api/requests/resource/[id]/route.test.ts` pins the server side, but nothing pins the client side, so this grep is the check.

- [ ] **Step 3: Manual verification** — approve one request, decline another; both update optimistically and survive a refresh.

- [x] **Step 4: Commit**
```bash
git add app/app/admin/approvals/
git commit -m "refactor(approvals): extract ResourceRequests into its own component"
```

### Task 6 — Extract `<FieldRequests/>`

Same method. This one carries the category/subcategory merge-target state (`mergeCategory`, `mergeSubcategory`, `subcategoryMap`) and the `/api/forms/categories/{id}` tree fetches — move all of it, including the per-category tree fetch loop (`page.tsx:94`).

- [ ] Move verbatim; run; manually approve a field request **with** a merge target and **without** one; commit.

### Task 7 — Extract `<TransferApprovals/>`

Same method.

- [ ] Move verbatim; run; manually approve and decline a transfer; commit.

### Task 8 — Reduce `page.tsx` to a shell and fix its theming

**Files:**
- Modify: `app/app/admin/approvals/page.tsx`

- [x] **Step 1:** What remains should be a layout: heading, the three components, nothing else. Target under 60 lines.
- [x] **Step 2: Fix the F20 theming divergence while here** — replace `on-surface` / `surface-container` Material-compat tokens with the app's sky/slate vocabulary, and raise the ~32 px action buttons to the app's 44–48 px `.btn-primary` / `.btn-secondary` sizing. Do this in the three extracted components, not the shell.
- [ ] **Step 3: Verify** at 375 px: every approve/decline control is at least 44 px tall and visually matches the rest of the app.
- [x] **Step 4: Commit**
```bash
git add app/app/admin/approvals/
git commit -m "refactor(approvals): page becomes a shell; align theming and touch targets"
```

---

## F16 — Client pages → server components

### The nine pages (verified)

`admin/expenses`, `admin/live-feed`, `admin/users`, `admin/approvals`, `admin/analytics`, `requests/field`, `requests/resource`, `profile`, `notifications`.

### The pattern to copy

`app/app/dashboard/page.tsx` and `app/app/sites/[id]/page.tsx`: server component → `Promise.all` of query functions → `initial*` props into a client child → the client child passes `fallbackData` to SWR. Read both before starting:
```bash
sed -n '1,60p' app/app/dashboard/page.tsx
```

### Rules

- **`notifications/page.tsx` is converted LAST, or skipped.** It interacts with the push/service-worker layer, which is client-only and easy to break silently. If in doubt, skip it and record why.
- **`admin/approvals` requires F12 (Tasks 5–8) to be merged first.**
- **Auth changes shape.** These pages read the session client-side today; the server versions must use the header-based session (`lib/auth/session.ts`). Getting this wrong turns an admin page into a 500 or, worse, renders admin data for a non-admin — so every converted page needs an explicit authorization check on the server before it queries.
- **One page per commit.** Nine pages in one diff is unreviewable.

### Task 9 — Convert one page as the pilot

**Files:**
- Modify: `app/app/requests/resource/page.tsx`
- Create: `app/app/requests/resource/ResourceRequestsPageClient.tsx`

Pick this one: it is the simplest of the nine and it has server-side siblings to copy from.

- [x] **Step 1: Read the current page end-to-end.** List: every fetch it makes, every piece of auth it reads, every client-only API it touches (`window`, `localStorage`, `navigator`).
- [x] **Step 2: Move the entire current component** into `ResourceRequestsPageClient.tsx` unchanged, add `'use client'`, and have `page.tsx` render it. **Commit this alone** — no behaviour change, and it isolates any breakage caused by the split from breakage caused by SSR.
- [ ] **Step 3: Verify** the page renders exactly as before. Commit.
- [x] **Step 4: Make `page.tsx` a server component:**
  ```tsx
  export default async function Page() {
    const session = await getSessionFromHeaders();       // header-based, no DB
    if (!session) redirect("/login");                     // match sibling pages
    // Authorization: this page is admin-scoped — check the capability HERE,
    // before querying. The client component can no longer be the gate.
    if (!can(session.user.role, "<the capability this page needs>")) notFound();

    const initialRequests = await getResourceRequestsFor(session.user);
    return <ResourceRequestsPageClient initialRequests={initialRequests} />;
  }
  ```
  Use the exact helpers the sibling server pages use — read `app/app/sites/[id]/page.tsx` for the real names rather than copying the sketch above.
- [x] **Step 5: Pass `fallbackData` in the client child** so SWR renders immediately and revalidates in the background:
  ```tsx
  const { data } = useApiResult<ResourceRequest[]>('/api/requests/resource', {
    fallbackData: { ok: true, data: initialRequests, status: 200 } as ClientResult<ResourceRequest[]>,
  });
  ```
  Check `useApiResult`'s real options signature (`lib/http/useApiQuery.ts:43`) before writing this — if it does not forward SWR options, either add that forwarding (with a test) or keep the initial data in local state seeded from the prop.
- [ ] **Step 6: Verify**
  - View source on the page → the request rows are present in the initial HTML, not just a "Loading…" shell.
  - A non-admin hitting the URL directly gets the same rejection as before (not a partially rendered page).
  - Approving/declining still works and still updates optimistically.
- [x] **Step 7: Commit**
```bash
git add app/app/requests/resource/
git commit -m "perf(requests): render the resource-requests page server-side with initial data"
```

### Task 10 — Convert the remaining pages, one commit each

- [x] `requests/field`
- [x] `admin/users`
- [x] `admin/expenses`
- [x] `admin/analytics` (note: its API route is already cached — the server page should call the same query helper, **not** fetch its own API over HTTP)
- [ ] `admin/live-feed` (check whether it polls; a polling page still benefits from an SSR first paint)
- [x] `profile`
- [x] `admin/approvals` — **only after F12 Tasks 5–8 are merged.** Convert the shell to a server component and pass initial data to each of the three child components.
- [ ] `notifications` — **last, or skipped.** If skipped, record the reason in this doc.

For each: same six steps as Task 9, same verification, one commit.

---

## Phase regression checklist

### Automated

- [x] `npm run lint` → exit 0.
- [x] `npm run test -- --testTimeout=30000` → green, pass count ≥ baseline + new tests.
- [ ] `npm run test:e2e` → green. **This is the main guard for F16** — `smoke.spec.ts` and `route-migration.spec.ts` load these pages.
- [x] `tests/migration/no-src-imports.test.ts` green, including the new client-import fence.
- [x] `lib/catalog/units.test.ts`, `lib/catalog/materialUnits.test.ts` green after the move.
- [x] `app/api/requests/field/[id]/route.test.ts`, `requests/resource/[id]/route.test.ts` green — untouched, which is the point.
- [x] `grep -rn "db/queries/materialUnits" app components lib` → empty.
- [x] `wc -l app/app/admin/approvals/page.tsx` → under 60.

### Security — the highest-risk area in this phase

F16 moves authorization from the client to the server. Get one page wrong and admin data renders for a supervisor.

- [x] **For every converted page**, confirm the server component performs an explicit capability/role check **before** it queries, and that the check matches what the client component used to enforce. List them here as you go:

  | Page | Capability checked | Verified |
  |---|---|---|
  | requests/resource | | ☐ |
  | requests/field | | ☐ |
  | admin/users | | ☐ |
  | admin/expenses | | ☐ |
  | admin/analytics | | ☐ |
  | admin/live-feed | | ☐ |
  | profile | | ☐ |
  | admin/approvals | | ☐ |

- [ ] **Negative test per admin page:** sign in as a Supervisor, hit each admin URL directly → the same rejection as before the conversion (redirect or 404), and **no admin data in the served HTML**. Check with `curl` + the session cookie, not just the browser — a client-side redirect still ships the data.
- [x] **No secret reaches the client.** The `initial*` props are serialised into the HTML payload. Confirm none of them contain fields the client did not previously receive from the API (e.g. internal ids, other users' emails). Diff the API response shape against the prop shape for each page.
- [x] Approval endpoints and verbs unchanged: `git diff main -- app/app/admin/approvals/ | grep -n "requestJson\|method:"` → only moves, no changes.
- [x] `resolveReviewSiteId`'s capability check (`can(role, "site:read_all")`) survived the extraction verbatim — a bug here lets a supervisor's review land on a site they do not supervise. Task 3 test cases 4 and 5 cover it; confirm both are present and passing.

### Performance

- [ ] Each converted page's initial HTML contains real data (`curl` the page, grep for a known value) — no "Loading…" as the first paint.
- [x] No page issues the same query twice (once server-side, once immediately client-side). SWR with `fallbackData` still revalidates once on mount; that is expected and fine. Two *server* queries is not.
- [x] `admin/analytics` server page calls the query helper directly, not its own HTTP route (a server component fetching its own API is a round-trip through the load balancer for no reason).
- [ ] Approvals page: three components each issue one request; total request count is not higher than the four the monolith issued.

### Behavioural

- [ ] Category creation with a similar name still flags for review, still notifies admins, still inserts the `fieldRequests` row — and the notification copy is **character-identical** (diff the strings before/after).
- [ ] Subcategory creation via `CatalogManager` still surfaces the 409 + candidates flow and the override path.
- [ ] Unit picker in `EntryForm` and `TransferForm` still lists the same units after the F13 move.
- [ ] Every approval action works: approve/decline a resource request, a field request (with and without a merge target), a transfer.


---

## Execution record (2026-08-07)

Before Phase 4: 605 tests passing. After: **636 passing / 12 skipped (94 files)**, `npm run lint` exit 0,
`npm run build` succeeds.

### What landed

- **F13** — the pure unit helpers moved from `lib/db/queries/materialUnits.ts` into
  `lib/catalog/units.ts`; the test moved to `lib/catalog/materialUnits.test.ts`; all five importers
  (including `lib/db/queries/materialUnitRule.ts`) were repointed and the old file deleted, so no
  shim remains. `grep -rn "db/queries/materialUnits"` is empty. The new fence in
  `tests/migration/no-src-imports.test.ts` was mutation-checked: adding a value import from
  `@/lib/db/queries/*` to a `'use client'` file makes it fail.
- **F11** — `lib/catalog/review.ts` now owns `resolveReviewSiteId`, `submitForReview`,
  `buildFieldRequestRows`, `checkSimilarNames` and `SIMILARITY_REVIEW_THRESHOLD` (the 0.7 literal
  was in four places). Routes: categories 227 → 161, subcategories 224 → 158, the two `similar`
  routes 38/43 → 31/36. The 10-case characterisation test written first
  (`app/api/forms/categories/route.test.ts`) still passes unchanged — including case 3, the silent
  skip when no review site resolves.
- **F12** — approvals split into `ResourceRequests`, `FieldRequests` (which owns both field-request
  surfaces, since they read one list) and `TransferApprovals`; `page.tsx` 337 → 55 lines. Endpoints
  and verbs were diffed against `HEAD` and are byte-identical. Theming moved to the sky/slate
  vocabulary with `min-h-11` (44 px) action buttons.
- **F16** — seven of nine pages converted: `requests/resource` (pilot), `admin/analytics`,
  `admin/users`, `requests/field`, `admin/expenses`, `profile`, `admin/approvals`. New server-side
  query helpers: `resourceRequests.ts`, `adminAnalytics.ts`, `adminUsers.ts`, `sitesList.ts`,
  `transfersList.ts`, `userProfile.ts` — each shared with the HTTP route it mirrors, so neither can
  drift, and `admin/analytics` no longer round-trips through its own API.

### Authorization, per converted page

| Page | Gate on the server component | Notes |
|---|---|---|
| requests/resource | session only | `getResourceRequestsFor` scopes rows by `resource:manage_all`, exactly as the API does |
| requests/field | `field_request:read` | admin-only capability; matches the route's `requireAdmin` |
| admin/users | `listAdminUsers` returns `{ ok: false }` → `notFound()` | keeps the §8.7/S2 stateful DB role re-read; a demoted admin with a valid token gets a 404 and no list in the HTML |
| admin/expenses | session only | `listSitesFor` scopes by `site:read_all`; expenses still load per selected site |
| admin/analytics | `analytics:read` (admin-only) | matches the route's `requireAdmin` |
| profile | session only | returns the caller's own record; id comes from the verified session |
| admin/approvals | `resource_request:approve` + `field_request:read` | checked before any query |

All `/app/admin/*` pages also sit behind the pre-existing server guard in `app/app/admin/layout.tsx`
(`resource:manage_all`), so the per-page checks are defence in depth, not the only gate.

### Bugs found while converting (fixed deliberately, called out here)

Typing the `initial*` props against the real DB rows exposed three live defects of the same class —
client types written against an id shape the API does not return:

1. `app/app/requests/resource` sent `request.id` (numeric identity column) to
   `/api/requests/resource/{id}`, which matches on `requestId` (uuid). Approve/decline from that
   page always 404'd. Now sends `requestId`.
2. `app/app/requests/field` sent `request.id` to `/api/requests/field/{id}`, which matches on
   `fieldRequestId`. Approve/decline/withdraw always 404'd. Now sends `fieldRequestId`.
3. `app/app/admin/expenses` keyed the site picker off `site.id` and built
   `/api/sites/{id}/entries` from it, but `/api/sites` returns rows whose uuid is `siteId`. Now uses
   `siteId`.

Also widened two client types that were narrower than their columns: `Site.budget` is nullable, and
`Transfer.resourceType` includes `Money` and `Machinery`.

### Deliberately not converted

- **`admin/live-feed`** — it has no initial fetch at all. It opens a Supabase realtime subscription
  in the browser and fills from `INSERT` payloads, so a server render has nothing to hand it. SSR
  would add a query and a prop for zero first-paint content.
- **`notifications`** — skipped per the phase rules: it drives the push/service-worker layer, which
  is client-only and easy to break silently.

### Not verified in this pass

- **All manual/visual checks**: approve/decline round-trips, the 375 px touch-target pass, the
  `CatalogManager` create-with-similar-name flow, the unit picker after the F13 move, and the
  `curl`-with-session negative tests for each admin page. These need a running app with a signed-in
  session.
- **`npm run test:e2e` is still red for the pre-existing reason recorded in Phase 3**:
  `e2e/route-migration.spec.ts` imports `betterAuthUsers` from `@/lib/db/schema`, which does not
  export it. Unrelated to this phase; it means the F16 e2e guard the checklist relies on is
  currently unavailable.
