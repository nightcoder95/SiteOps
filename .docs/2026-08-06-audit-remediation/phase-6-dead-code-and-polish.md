# Phase 6 — Dead code & UI polish

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete what nothing uses, fix the one active z-index bug, stop a POST-per-keystroke, standardise on one icon system, and bring touch targets to 44 px.

**Architecture:** Two halves that share nothing. F19 is deletion — the only risk is deleting something that turns out to be live, so every deletion is grep-verified at deletion time, not from a doc. F20 is a batch of small independent UI fixes, each shippable alone; the icon migration is the only one with a measurable payoff (dropping a webfont).

**Tech stack:** TypeScript, Tailwind 4, lucide-react, Next 16 font loading.

**Covers audit findings:** F19, F20.

**Dependency:** Phase 3 rewrote `components/operations/entryFormat.tsx`, where two of the five dead-code items live. Run F19 after Phase 3, or expect merge conflicts.

---

## Global constraints

Read [README.md § Global constraints](README.md#global-constraints-apply-to-every-phase-every-task). Phase-specific:

- **Grep-verify every deletion at the moment you delete it.** The tree moves; this document is a starting point, not authority.
- **`npm run lint` (`tsc`) is the real deletion test.** A dead export that was actually imported fails the build immediately. Run it after every single deletion.
- **Do not delete anything on the audit's "verified NOT dead" list:** `proxy.ts`, `app/~offline`, `components/logs/DynamicEntryForm.tsx`, `design-system/siteops/`, `lib/services/nonCritical.ts`, `lib/services/decimals.ts`.
- Run tests as `npm run test -- --testTimeout=30000`.

---

## Pre-flight

- [x] **P0.1** Phase 3 merged.
- [x] **P0.2** Clean tree, green baseline, recorded pass count.
- [ ] **P0.3** `git checkout -b phase-6-cleanup-and-polish`.

---

## F19 — Dead code

### Verified dead (2026-08-06)

| Item | Location | Evidence |
|---|---|---|
| `mergeVisualEntries` | `components/operations/entryFormat.tsx:127-172` | Exported; grep finds **only the definition**. No test. ~46 lines. |
| `entryCategoryKey` | `components/operations/entryFormat.tsx:174-180` | Exported; grep finds the definition and **one comment mention** in `gridCategoryKey`'s doc block. Superseded by `gridCategoryKey` (6 real refs). |
| `catalogNounForCategory` | `lib/catalog/addCta.ts:16-19` | Exported; only importer is its own test (`addCta.test.ts`). Mapping also duplicates `lib/catalog/overview.ts` `CATALOG_OPERATIONS[].noun`. |
| `lib/db/migrations/schema.ts` | 10 155 B | Zero imports. `drizzle.config.ts` points at `lib/db/schema.ts`. Still declares pg enums dropped in migration 0021 — actively misleading. |
| `lib/db/migrations/relations.ts` | 81 B | Zero imports. Same introspect output. |

### Verified NOT worth deleting — the audit is wrong on both

| Item | Audit says | Reality |
|---|---|---|
| `lib/http/notificationsKeys.ts` | "4-line pass-through, fold into consumers" | It is a **shared SWR cache key** with **two** consumers (`app/app/notifications/page.tsx`, `components/app-shell/AppHeader.tsx`) and a comment explaining that both must revalidate the *same* cache entry. Inlining it re-creates the exact bug it prevents. **Keep.** |
| `lib/http/cacheHeaders.ts` | "8-line pass-through, fold into consumers" | `withNoStore` has **four** consumers, all permission-sensitive routes, and its comment documents a security decision (§8.5: never serve a stale role from the SW cache). Four consumers exceeds the audit's own "≤2 consumers" threshold. **Keep.** |

Both are small *and* deep — a tiny interface hiding a rule you must not get wrong. That is the shape of a good module, not a bad one.

---

### Task 1 — Delete `mergeVisualEntries` and `entryCategoryKey`

**Files:**
- Modify: `components/operations/entryFormat.tsx`

- [x] **Step 1: Re-verify, now**
```bash
grep -rn "mergeVisualEntries\|entryCategoryKey" app components lib e2e --include="*.ts" --include="*.tsx"
```
Expected: the definitions plus the one comment. **Anything else → stop and investigate.**

- [x] **Step 2: Delete both functions.** Also update `gridCategoryKey`'s doc comment, which currently reads "Unlike entryCategoryKey, …" and would otherwise reference a function that no longer exists:

```ts
// Grid-grouping key for the category-first operation view. Material groups by
// materialType alone — work-stage is a filter inside the category detail page,
// not part of the grid identity.
```

- [ ] **Step 3: Verify**
```bash
npm run lint && npm run test -- --testTimeout=30000
```
`tsc` is the proof. If it passes, nothing imported them.

- [ ] **Step 4: Commit**
```bash
git add components/operations/entryFormat.tsx
git commit -m "chore(operations): remove unused mergeVisualEntries and entryCategoryKey"
```

---

### Task 2 — Delete `catalogNounForCategory` and unify the noun mapping

**Files:**
- Modify: `lib/catalog/addCta.ts`
- Modify: `lib/catalog/addCta.test.ts`

**Order matters** (the audit is right about this): `catalogNounForCategory` is dead, but `addCtaLabel` in the same file is **live**. Delete the function and its test cases; keep the file.

- [x] **Step 1: Re-verify**
```bash
grep -rn "catalogNounForCategory" app components lib e2e
```
Expected: the definition plus its own test file only.

- [x] **Step 2: Check whether `addCtaLabel` uses it internally**
```bash
sed -n '1,40p' lib/catalog/addCta.ts
```
If `addCtaLabel` calls `catalogNounForCategory`, it is **not** dead — it is private. In that case: remove the `export` keyword instead of the function, keep the tests that exercise it through `addCtaLabel`, and stop here.

- [x] **Step 3: If genuinely unused, delete the function and its `describe` block.**

- [x] **Step 4: Note the remaining duplication**

The noun mapping also lives in `lib/catalog/overview.ts` as `CATALOG_OPERATIONS[].noun`. Collapsing them into one source is a **separate** change with real behavioural risk (the two mappings may not be identical — check before assuming). Do not do it in the same commit as a deletion. Diff them and record the result:
```bash
grep -n "noun" lib/catalog/overview.ts
```
| Category | `addCta` noun | `overview` noun | Same? |
|---|---|---|---|
| | | | |

If they differ anywhere, that is a bug worth its own task.

- [ ] **Step 5: Verify + commit**
```bash
npm run lint && npm run test -- --testTimeout=30000
git add lib/catalog/addCta.ts lib/catalog/addCta.test.ts
git commit -m "chore(catalog): remove unused catalogNounForCategory"
```

---

### Task 3 — Remove the stale drizzle introspect output

**Files:**
- Delete: `lib/db/migrations/schema.ts`
- Delete: `lib/db/migrations/relations.ts`
- Modify: `README.md` or `drizzle.config.ts` (a comment, see Step 4)

These are introspect output, not migrations. They declare pg enums that migration 0021 dropped, so anyone reading them as truth gets the wrong schema.

- [x] **Step 1: Re-verify zero imports**
```bash
grep -rn "migrations/schema\|migrations/relations" app components lib scripts drizzle.config.ts package.json
```
Expected: empty.

- [x] **Step 2: Confirm they are not migration files**
```bash
ls lib/db/migrations/ | head -40
```
The real migrations are numbered `.sql` files. Confirm `schema.ts` / `relations.ts` are not referenced by `lib/db/migrations/meta/_journal.json`:
```bash
grep -n "schema.ts\|relations.ts" lib/db/migrations/meta/_journal.json
```
Expected: empty. **If they appear, do not delete** — escalate.

- [x] **Step 3: Delete**
```bash
git rm lib/db/migrations/schema.ts lib/db/migrations/relations.ts
npm run lint && npm run test -- --testTimeout=30000
```

- [x] **Step 4: Stop them coming back**

They are `drizzle-kit introspect` output — a teammate running introspect regenerates them. Add a note where someone will actually see it. Preferred: a comment in `drizzle.config.ts`:

```ts
// NOTE: `drizzle-kit introspect` writes lib/db/migrations/{schema,relations}.ts.
// Those files are NOT the source of truth (lib/db/schema.ts is) and go stale
// immediately — they were deleted in 2026-08 because they still declared enums
// dropped in migration 0021. If you run introspect, delete its output again.
```

Add the same note to the migrations section of the project README if one exists.

- [ ] **Step 5: Commit**
```bash
git add -A
git commit -m "chore(db): remove stale drizzle introspect output"
```

---

### Task 4 — Optional dependency audit

- [x] **Step 1:** `npx depcheck` (the audit did not check this conclusively).
- [ ] **Step 2:** For each reported unused dependency, **verify by grep before removing** — depcheck misses dynamic imports, Next config references, and PostCSS/Tailwind plugins entirely. Expect false positives for `autoprefixer`, `@tailwindcss/postcss`, `tsx`, `@types/*`.
- [ ] **Step 3:** Remove only what you have independently confirmed unused. `npm run build` after, not just `lint` — a missing build-time dependency does not show up in `tsc`.
- [ ] **Step 4:** Commit separately from the code deletions.

---

## F20 — Polish batch

Each task below is independently shippable. Do them in this order — the first is an active bug.

### Task 5 — Fix the z-index bug (active defect)

**Files:**
- Modify: `components/data-export/DataExportPanel.tsx`
- Modify: `components/catalog/RowActionsMenu.tsx`
- Modify: `app/globals.css`

**Correction to the audit:** `DataExportPanel` is at `components/data-export/`, not `components/export/`. And there are **two** `z-30` dropdowns, not one: `DataExportPanel.tsx:171` and `RowActionsMenu.tsx:68`. Both can slip under the `z-50` fixed header.

Verified z-scale in use: `z-10`, `z-30` (×2), `z-50` (×4, incl. `AppHeader`), `z-[60]` (×4), `z-[70]`, `z-[90]`, `z-[1000]` (`confirmDialog`).

- [ ] **Step 1: Reproduce the bug.** Open the export panel's dropdown near the top of a scrolled page → it renders **under** the fixed header. Same for a row-actions menu on the first row of a catalog table.

- [x] **Step 2: Define the scale as tokens** in `app/globals.css`:

```css
:root {
  /* Layering scale. Overlays must sit above the fixed header (z-50) or they
     render behind it — this was a live bug in the export and row-action
     dropdowns, both of which used z-30. */
  --z-dropdown: 60;
  --z-sticky: 50;
  --z-overlay: 70;
  --z-modal: 80;
  --z-toast: 90;
  --z-confirm: 1000;
}
```

Set the values to match what is **already** in use so nothing else moves: `z-50` stays the header, `z-[1000]` stays the confirm dialog.

- [x] **Step 3: Fix the two dropdowns.** Change both from `z-30` to `z-[60]` (above the `z-50` header, below the `z-[70]` overlays). Verify the fix at both sites.

- [ ] **Step 4: Migrate other overlays opportunistically.** Do **not** convert all of them now — a global z-index churn risks a stacking regression nobody notices until a user reports it. The tokens exist; use them in new code and when you next touch a file.

- [ ] **Step 5: Commit**
```bash
git add components/data-export components/catalog app/globals.css
git commit -m "fix(ui): raise dropdowns above the fixed header and add z-index tokens"
```

---

### Task 6 — Debounce the similarity check

**Files:**
- Modify: `components/logs/CategoryPicker.tsx`

**The defect:** `CategoryPicker.tsx:260-261` calls `void checkSimilarity(e.target.value)` directly in `onChange` — a POST per keystroke. Typing "Brickwork" fires nine requests, each hitting `withApi` (and therefore the rate limiter).

**The pattern already exists:** `lib/hooks/useDebouncedValue.ts`, used by `useGlobalSearch.ts:84` at 180 ms. Reuse it; do not hand-roll a timer.

- [x] **Step 1: Wire the hook**

```tsx
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";

// …inside the component
const debouncedName = useDebouncedValue(name, 180);

useEffect(() => {
  // Similarity is advisory (it shows a hint; it never blocks submit), so
  // checking the settled value rather than every keystroke costs nothing and
  // saves ~8 POSTs per typed name.
  if (!debouncedName.trim()) return;
  void checkSimilarity(debouncedName);
}, [debouncedName]);
```

and remove the direct call from `onChange`, leaving only `setName(e.target.value)`.

- [ ] **Step 2: Preserve the UX semantics.** The hint appears and **does not block submit**. Verify: type a near-duplicate name → after ~200 ms the hint appears → submitting still works.

- [x] **Step 3: Check the empty-input path.** Clearing the field must clear any stale hint. If `checkSimilarity` is what clears it, the `if (!debouncedName.trim()) return;` guard above would leave the hint stranded — in that case clear the hint explicitly in the guard rather than returning silently.

- [ ] **Step 4: Verify** with the Network tab: typing a 9-character name fires **one** POST, not nine.

- [x] **Step 5: Check the sibling.** `SubcategoryCombobox` and `CatalogAddModal` may have the same pattern:
```bash
grep -rn "checkSimilarity" components
```
Apply the same fix wherever it appears un-debounced.

- [ ] **Step 6: Commit**
```bash
git add components/logs/CategoryPicker.tsx
git commit -m "perf(catalog): debounce the similarity check instead of firing per keystroke"
```

---

### Task 7 — 44 px touch targets in the header

**Files:**
- Modify: `components/app-shell/AppHeader.tsx`

**Verified:** the back, search and bell buttons use `p-2` with a `w-5 h-5` (20 px) icon → 8 + 20 + 8 = **36 px**. The entry-list edit/delete buttons are already 40 px (`w-10 h-10`). The iOS/Android guidance floor is 44 px, and these are the controls a supervisor taps with gloves on.

**Enlarge via padding, not icon size** — growing the icon changes the header's visual weight and can reflow the flex row.

- [x] **Step 1: Change `p-2` → `p-3`** on the three buttons (12 + 20 + 12 = 44 px). The back button also carries `-ml-2` for optical alignment; adjust to `-ml-3` so the icon stays where it was.

- [ ] **Step 2: Verify no reflow** at 375 px. The header is `h-16` (64 px), so a 44 px control fits with room. Confirm the title block and the right-hand cluster do not wrap.

- [x] **Step 3: Check the notification dot.** It is positioned `top-1.5 right-1.5` relative to the button — with more padding it will drift inward. Re-position so it still sits on the bell glyph's corner.

- [x] **Step 4: Sweep for other sub-44 px targets**
```bash
grep -rn 'className="[^"]*p-2[^"]*"' components/app-shell components/layout 2>/dev/null | head -20
```
Fix the ones that are actual tap targets; ignore padding on non-interactive elements.

- [ ] **Step 5: Commit**
```bash
git add components/app-shell/AppHeader.tsx
git commit -m "fix(a11y): raise header touch targets to 44px"
```

---

### Task 8 — `router.back()` → computed logical parent

**Files:**
- Modify: `components/app-shell/AppHeader.tsx`

**The defect:** `AppHeader.tsx:63` calls `router.back()`. On a deep-linked arrival (push notification, shared URL, PWA shortcut) the history stack is empty, so "back" exits the app.

- [x] **Step 1: Compute the parent from the pathname**

```tsx
// Deep-linked arrivals (push notifications, shared URLs, PWA shortcuts) have no
// history entry, so router.back() exits the app. Derive the logical parent from
// the route instead; fall back to the dashboard.
function logicalParent(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  // /app/sites/:id/operations/:type/:category → /app/sites/:id/operations/:type
  // /app/sites/:id/operations/:type           → /app/sites/:id
  // /app/sites/:id                            → /app/dashboard
  // …enumerate the real routes; do not hand-wave.
  if (segments.length <= 2) return "/app/dashboard";
  return `/${segments.slice(0, -1).join("/")}`;
}
```

**Enumerate the actual route tree before writing this.** Naive "drop the last segment" is wrong for at least `/app/sites/:id/operations/:type`, whose logical parent is the site page, not `/app/sites/:id/operations` (which may not exist as a route). List them:
```bash
find app/app -name "page.tsx" | sed 's|app/app||; s|/page.tsx||' | sort
```
Map each to its parent explicitly.

- [x] **Step 2: Prefer history when it exists.** A user who navigated in-app expects back to undo *their* navigation, not to jump to a computed parent:

```tsx
onClick={() => {
  // In-app navigation: honour the real history. Deep link: computed parent.
  if (window.history.length > 1) router.back();
  else router.push(logicalParent(pathname));
}}
```
`window.history.length > 1` is a heuristic, not a guarantee (a fresh tab reports 1; a tab that has been elsewhere reports more). It is the best signal available without threading state through every navigation, and its failure mode is benign: an extra correct back-navigation.

- [x] **Step 3: Unit-test `logicalParent`.** Extract it to its own module so it is testable without rendering, and cover every route from the Step 1 list plus `/app/dashboard` itself and an unknown path.

- [ ] **Step 4: Manual verification** — open the app fresh at a deep URL (paste it into a new tab) and press back: it goes to the parent screen, **not** out of the app.

- [ ] **Step 5: Commit**
```bash
git add components/app-shell
git commit -m "fix(nav): fall back to a computed parent when there is no history"
```

---

### Task 9 — Migrate off Material Symbols to lucide

**Files:**
- Modify: ~13 files using `material-symbols-outlined`
- Modify: `app/layout.tsx` (the font link)
- Modify: `app/globals.css` (the class)

**Verified usage** — `material-symbols-outlined` appears in: `app/app/requests/field/page.tsx` (×4), `requests/resource/page.tsx` (×4), `sites/new/SitesNewPageClient.tsx`, `profile/DangerZone.tsx`, `profile/page.tsx` (×2), `logs/new/[categoryId]/page.tsx`, `notifications/page.tsx`, `~offline/page.tsx`, `components/logs/EntryForm.tsx` (×2), plus a literal `⚠` emoji at `CategoryPicker.tsx:331`.

The font is loaded from Google Fonts at `app/layout.tsx:54-58`. **The payload win only lands when the last usage is gone** — a partial migration is pure churn.

- [x] **Step 1: Build the glyph → lucide mapping**
```bash
grep -rhn "material-symbols-outlined" app components -A1 | grep -o ">[a-z_]*<" | sort -u
```
Map each glyph name to a lucide component (`send` → `Send`, `check` → `Check`, `close` → `X`, `undo` → `Undo2`, `delete` → `Trash2`, `save` → `Save`, `logout` → `LogOut`, `arrow_back` → `ArrowLeft`, `add_location` → `MapPinPlus`, `delete_forever` → `Trash2`, `cloud_off` → `CloudOff`). **Verify each name exists in lucide-react 0.546** before using it — a wrong name is a build error, which is fine, but a *similar* wrong icon is a silent UX change.

- [x] **Step 2: Migrate file by file, one commit each.** Keep the rendered size: the font glyphs use `style={{ fontSize: '18px' }}` → `className="w-[18px] h-[18px]"`, `16px` → `w-4 h-4`, `20px` → `w-5 h-5`, `40px` → `w-10 h-10`. Import named, as the rest of the codebase does (`import { Send } from "lucide-react"`) — never the whole namespace.

- [x] **Step 3: Replace the `⚠` emoji** at `CategoryPicker.tsx:331` with `<AlertTriangle className="w-4 h-4" />`. Emoji render differently on every platform and are announced oddly by screen readers.

- [ ] **Step 4: Only when the last usage is gone**, remove:
  - the `<link>` to `Material+Symbols+Outlined` in `app/layout.tsx:58`,
  - the `.material-symbols-outlined` rule in `app/globals.css:161`,
  - the `preconnect` to `fonts.googleapis.com` **only if no other Google font is loaded** — check line 54's neighbours first.

- [ ] **Step 5: Verify**
```bash
grep -rn "material-symbols" app components
```
→ empty. Then load the app with the Network tab filtered to fonts: the Material Symbols request is gone. Record the saved bytes here: ______ KB.

- [ ] **Step 6: Visual sweep** of all ~13 changed screens. Icon weight and alignment differ slightly between an icon font and an SVG set — check optical alignment inside buttons.

- [ ] **Step 7: Commit** (one per file during migration, one final for the font removal)
```bash
git commit -m "chore(ui): drop the Material Symbols webfont after migrating to lucide"
```

---

### Task 10 — Associate the remaining form labels

**Files:**
- Modify: `components/logs/CategoryPicker.tsx` (the modal, `:250-310`)
- Modify: `components/transfers/TransferForm.tsx` (`:137-229`)

The split-labour inputs were fixed in Phase 1 Task 4. These two remain. The correct pattern already exists in `FieldRow` (`EntryForm.tsx:378-445`): `<label htmlFor={id}>` + `<input id={id}>`.

- [x] **Step 1: Add `htmlFor`/`id` pairs** to every label/control pair in both files. Use stable ids derived from the field name (`id={`transfer-${name}`}`), not indexes.
- [ ] **Step 2: Verify** by clicking each label — focus must move to its control. That is the whole test.
- [ ] **Step 3: Commit**
```bash
git commit -m "fix(a11y): associate labels with their controls in CategoryPicker and TransferForm"
```

---

### Task 11 — Skeletons instead of layout-jumping loaders

**Files:**
- Modify: `components/catalog/CatalogManager.tsx` (`:237-238`)
- Modify: `components/tools/ToolsHub.tsx` (`:174`)

Both render a bare "Loading…" string then swap to full content, so the page jumps. `GlobalSearchOverlay.tsx:197-205` already has the right pattern.

- [x] **Step 1: Copy the skeleton markup** from `GlobalSearchOverlay`, sized to the final layout's row height so nothing shifts when data arrives.
- [ ] **Step 2: Verify** with network throttling (DevTools → Slow 3G): the skeleton occupies the same height as the loaded content; no jump.
- [ ] **Step 3: Commit**
```bash
git commit -m "fix(ui): skeleton loaders instead of layout-jumping text in catalog and tools"
```

---

### Task 12 — Converge modals on `ModalShell` (scoped)

**Files:**
- Modify: `components/tools/ToolLedgerDrawer.tsx`, `components/catalog/CatalogAddModal.tsx`, `components/catalog/MergeModal.tsx`

**Scope:** modals only. The audit also lists popovers (`DataExportPanel`, `DateFilterField`, `RowActionsMenu`, `SubcategoryCombobox`, `UnitSelect`) — **building a shared popover primitive is a design-system task, not a cleanup task.** It belongs in Appendix C's C.1 work, which needs its own brainstorm and spec. Do not start it here.

- [x] **Step 1: Read `ModalShell`'s contract** (`components/ui/motion.tsx`) — props, focus management, Escape handling, scroll lock, safe-area treatment.
- [ ] **Step 2: Convert one modal.** Verify: Escape closes it, focus is trapped inside, background does not scroll, the safe-area inset is respected on a notched viewport.
- [ ] **Step 3: Repeat for the other two, one commit each.**
- [ ] **Step 4:** If a modal has behaviour `ModalShell` cannot express (e.g. `ToolLedgerDrawer` may be a bottom sheet, not a centred modal), **stop and record it** rather than forcing the conversion. A drawer that behaves like a modal is a regression.

---

## Phase regression checklist

### Automated

- [x] `npm run lint` → exit 0. (This is the primary deletion test.)
- [ ] `npm run test -- --testTimeout=30000` → green; pass count = baseline **minus** the deleted `catalogNounForCategory` cases, plus any new tests. Account for the difference explicitly — an unexplained drop means you deleted a live test.
- [x] `npm run build` → succeeds. Required after Task 4 (dependency removal) and Task 9 (font link removal); `tsc` alone does not catch build-time breakage.
- [ ] `npm run test:e2e` → green. This is the main guard for the F20 UI changes.
- [x] `grep -rn "mergeVisualEntries\|entryCategoryKey\|catalogNounForCategory" app components lib` → empty.
- [x] `grep -rn "material-symbols" app components` → empty (after Task 9).
- [x] `grep -rn "z-30" components app` → empty.
- [x] `ls lib/db/migrations/*.ts` → no such files.

### Security

- [x] **`withNoStore` still applied to all four permission-sensitive routes.** It was on the audit's deletion list and is **not** being deleted — confirm it survived:
  ```bash
  grep -rln "withNoStore" app/api
  ```
  → 4 files: `auth/change-password`, `admin/purge`, `admin/users`, `admin/users/[id]/role`. **If any lost it, a stale role can be served from the service-worker cache.**
- [x] **`UNREAD_BADGE_KEY` still shared** by both consumers — inlining it would let the badge and the notifications page revalidate different cache entries.
- [x] **No auth guard was deleted.** `grep -rln 'in auth\|withAuthedApi' app/api | wc -l` matches the pre-phase count.
- [ ] **Debounce did not weaken the duplicate check.** The similarity endpoint is advisory; the *authoritative* duplicate guard is server-side (`lib/services/duplicateGuard.ts`) on the create route. Confirm the create route's 409 + candidates path still fires: create a genuine duplicate and check the override flow appears.
- [ ] **Font removal did not break CSP.** The report-only CSP allows `https://fonts.googleapis.com` in `style-src` and `https://fonts.gstatic.com` in `font-src`. If those are now unused, they can be tightened — but do that in [Phase 7](phase-7-security-hardening.md) with the rest of the CSP work, not here.

### Behavioural

- [ ] All ~13 migrated icon screens render the intended icon at the intended size.
- [ ] Export dropdown and row-actions menu render **above** the header when opened near the top of a scrolled page.
- [ ] Typing a category name fires one similarity POST, and the hint still appears and still does not block submit.
- [ ] Header buttons are ≥ 44 px and the notification dot still sits on the bell.
- [ ] Back from a deep-linked page goes to the parent screen, not out of the app.
- [ ] Catalog and tools screens show a skeleton, then content, with no layout jump.
- [ ] Every converted modal traps focus, closes on Escape, and locks background scroll.

### Performance

- [ ] Material Symbols webfont no longer requested; bytes saved recorded.
- [ ] Similarity POSTs per typed name: 1, not ~9.
- [x] No bundle growth from the lucide migration — lucide is already a dependency and imports are named, so only the used icons ship.

---

## Explicitly out of scope

- **A shared popover primitive.** Design-system work (Appendix C.1); needs a spec.
- **Full z-index migration.** Tokens are defined; migrate opportunistically.
- **Unifying the two noun mappings** (`addCta` vs `overview`). Diff recorded in Task 2 Step 4; if they differ, that is its own task.
- **Deleting `notificationsKeys.ts` / `cacheHeaders.ts`.** Both are deep modules with real consumers — see the table above.


---

## Execution record (2026-09-04)

Baseline before Phase 6: 693 passing / 12 skipped (98 files). After: **719 passing / 12 skipped
(105 files)**. `npm run lint` exit 0, `npm run build` compiles.

Pass-count reconciliation, as the checklist demands: 693 − 4 (the deleted `catalogNounForCategory`
cases) + 30 new = 719.

### F19 — deletions

All three deletion sets were re-grepped at deletion time and `tsc` was run after each.

- **Task 1** — `mergeVisualEntries` (~46 lines) and `entryCategoryKey` deleted; `gridCategoryKey`'s
  doc comment no longer refers to a function that does not exist.
  **Follow-on the plan did not anticipate:** deleting `mergeVisualEntries` left `sumField` with zero
  callers — it was its only consumer. Grep-verified and deleted too. `entrySpend` is still live and
  was kept.
- **Task 2** — `catalogNounForCategory` confirmed dead (`addCtaLabel` does not call it, so it was
  not merely private), and `NOUN_BY_CATEGORY` died with it. **Step 4 diff, recorded as asked — the
  two mappings are identical, so there is no latent bug:**

  | Category | `addCta` noun | `overview` noun | Same? |
  |---|---|---|---|
  | Labour | Work Type | Work Type | yes |
  | Materials | Material Type | Material Type | yes |
  | Machinery/Equipment | Equipment Type | Equipment Type | yes |
  | Work Stage | Work Stage | Work Stage | yes |
  | Expense Category | Expense Category | Expense Category | yes |
  | Incident Type | Incident Type | Incident Type | yes |
  | Incident Severity | Severity | Severity | yes |

  `CATALOG_OPERATIONS` in `lib/catalog/overview.ts` is now the single owner; `addCta.ts`'s header
  says so.
- **Task 3** — `lib/db/migrations/{schema,relations}.ts` deleted. Verified first that the real
  migrations are the numbered `.sql` files and that `meta/_journal.json` references only those. The
  "if you run introspect, delete its output again" note is in `drizzle.config.ts`.
- **Task 4** — `npx depcheck` reported one unused production dependency, **`@posthog/next`**.
  Independently confirmed: the only PostHog import anywhere is `posthog-js` (dynamically, in
  `app/providers.tsx` and `lib/analytics/webVitals.ts`); `@posthog/next` has zero references.
  Removed, and `npm run build` re-run because `tsc` alone would not catch a build-time break.
  The flagged devDependencies were **not** removed: `@tailwindcss/postcss` is in
  `postcss.config.mjs`, `tailwindcss` is pulled by `@import "tailwindcss"` in `globals.css`, and
  `@types/react-dom` is consumed implicitly by `tsc` — all the false positives the plan predicted.
  `autoprefixer` does appear genuinely unreferenced (Tailwind 4 prefixes internally), but the upside
  is nil and a silently-missing vendor prefix is a bad trade, so it was left alone deliberately.

### F20 — polish

- **Task 5 (z-index)** — both `z-30` dropdowns raised to `z-[60]`, above the `z-50` header. The
  layering tokens are in `app/globals.css` with values matching what was already in use, so defining
  them moved nothing. `tests/ui/z-index.test.ts` fences any `absolute`/`fixed` element with a
  z-index under the header. It found a **third** hit the plan does not list —
  `TransferForm.tsx:153`, the swap-arrow badge between the two site pickers — which is *correctly*
  at `z-10`: it layers against its own siblings inside a card, and raising it would float it over
  the header, the same bug in the other direction. It is in an explicit allowlist with that reason.
- **Task 6 (debounce)** — `CategoryPicker` now checks the settled name via `useDebouncedValue` at
  180 ms. **The plan's Step 5 sibling sweep found the more important one:**
  `CatalogAddModal.handleNameChange` fired `onCheckSimilarity` per keystroke too, and its prop is
  *documented* as "Debounced live similarity check" — so `UnitsManager` and `SubcategoryCombobox`
  both inherited per-keystroke POSTs through the shared modal. Fixing it there fixes all three
  entry points. Both sites clear the hint on an empty field rather than stranding the previous
  name's verdict (the plan's Step 3 trap), and the modal now ignores an in-flight reply that
  arrives after the name has moved on.
- **Task 7 (touch targets)** — the three header buttons went `p-2` → `p-3` (12 + 20 + 12 = 44 px);
  the back button's `-ml-2` became `-ml-3` so the icon stays optically aligned, and the unread dot
  moved `top-1.5 right-1.5` → `top-2.5 right-2.5` to stay on the bell glyph. The Step 4 sweep of
  `components/app-shell` and `components/layout` found no other sub-44 px tap target.
- **Task 8 (back navigation)** — `logicalParent` is its own module with 12 unit tests covering every
  route in the tree. The mapping is explicit because the naive rule is wrong: `/app/sites/:id/
  operations` is not a route, so an operations page's parent is the **site** page. The header
  prefers real history (`window.history.length > 1`) and only computes a parent when there is none.
- **Task 9 (icon font)** — all 22 `material-symbols-outlined` usages across 12 files migrated to
  lucide, every icon name verified to exist in `lucide-react` 0.546 first. The `⚠` emoji became
  `<AlertTriangle/>`. The webfont `<link>`, **both** `preconnect`s and the `.material-symbols-outlined`
  / `.material-icon` CSS rules are gone — `Inter` comes through `next/font/google`, which self-hosts
  at build time, so nothing else needed those origins.

  **This task had a blocker the plan does not mention, resolved by reading production data.**
  `CategoryPicker` rendered `{c.icon ?? "category"}` — a glyph name from the `categories.icon`
  column, i.e. a *dynamic* font dependency that a code-only migration cannot remove. A read-only
  query showed **all 8 categories have `icon = NULL`**, so that expression always resolved to the
  literal `"category"`, and no UI writes the column (the create route accepts an optional `icon`,
  but nothing sends one). The fallback is now a static `<Shapes/>`.
  **Deliberate consequence to note:** per-category custom icons — a capability that exists in the
  schema and the create API but has never been populated or exposed — stop being rendered. No
  database change was made; the column is untouched.

  `tests/ui/no-icon-font.test.ts` is all-or-nothing on purpose: a partial migration leaves the font
  loading, which is pure churn.
- **Task 10 (labels)** — every `<label>` in `CategoryPicker` and `TransferForm` now carries
  `htmlFor`, and every control an `id`. Two cases needed something other than the plain pattern:
  the custom-field rows are a compact 12-column grid with placeholder-only inputs and no visible
  label, so they got `aria-label`s (naming them without redesigning the row); and "Resource Type"
  labels a pair of toggle **buttons**, not a form control, so `htmlFor` had no valid target — it is
  now a `role="group"` + `aria-labelledby` pair.
- **Task 11 (skeletons)** — only `CatalogManager` still had the bare "Loading…" string;
  `ToolsHub` already had a skeleton, so the plan's reference to it is stale. The new skeleton
  mirrors the loaded layout (chip row, toolbar, list rows) so nothing shifts on arrival.
- **Task 12 (modals)** — **the plan is stale: two of its three targets already use `ModalShell`**
  (`CatalogAddModal`, `MergeModal`). The third, `ToolLedgerDrawer`, is a right-side drawer with its
  own Escape handling — exactly the case Step 4 says to record rather than force, so it was left
  alone.

  What the convergence check actually exposed is a gap in the primitive: **`ModalShell` implemented
  none of the behaviours Step 2 verifies.** It had the overlay, click-outside close and animation,
  but no Escape, no scroll lock, and no dialog semantics — across all eight surfaces built on it, a
  keyboard user had no way out. Added: Escape-to-close, a ref-counted body scroll lock, and
  `role="dialog" aria-modal="true"`. The lock is ref-counted because overlays stack (a confirm
  dialog over a modal); a naive lock would unlock the page when the inner one closed. Its counter is
  a separate, DOM-free module with 5 unit tests, including the double-release case React StrictMode
  can produce.

  **Focus trapping was NOT implemented.** It is the one part that cannot be written responsibly
  without a rendering test to verify it, and this repo has no jsdom or testing-library. Recorded as
  outstanding rather than half-done.

### Not verified in this pass — needs a running app

- **Every visual and interaction check**: the two dropdowns rendering above the header, the 375 px
  header reflow and the unread dot's position, the icon sweep across all 12 migrated screens
  (icon-font and SVG optical alignment differ), the catalog skeleton under Slow 3G, label clicks
  moving focus, and back-from-a-deep-link.
- **Network-tab confirmations**: one similarity POST per typed name instead of ~9, and the Material
  Symbols request being gone. **The bytes-saved figure in Task 9 Step 5 is therefore still blank.**
- **`npm run test:e2e`** — still red for the pre-existing Phase 3 reason
  (`e2e/route-migration.spec.ts` imports `betterAuthUsers`, which `@/lib/db/schema` does not
  export). The plan names e2e as the main guard for the F20 UI changes, so that guard is unavailable.
- **The duplicate-guard behavioural check** (create a genuine duplicate, confirm the 409 + override
  flow). The debounce only changes *when* the advisory endpoint is called; the authoritative guard
  is server-side and untouched — but the flow itself was not exercised.

### Database

No schema change and no writes. The only database access was a **read-only** query of
`categories.icon` to establish whether Task 9's dynamic glyph path was reachable.

### Left for Phase 7, as the plan directs

`next.config.ts` still allows `https://fonts.googleapis.com` in `style-src` and
`https://fonts.gstatic.com` in `font-src`. Both are now unused and can be tightened — but that is
CSP work and belongs with S1.
