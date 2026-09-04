# Phase 1 — P0 user-facing defects & drifted duplication

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the five defects that directly block or mislead a field supervisor on a phone, and eliminate the one duplication that is already a live correctness bug.

**Architecture:** Four of the five are local component fixes. The fifth (F4) extracts a pure function `resolveMaterialUnit` into `lib/services/entries.ts` — the module that already owns `evaluateLabourSplit` — and makes both the create and update routes call it, ending a behavioural divergence where an entry can be *edited* into a state *creation* would reject.

**Tech stack:** Next 16 App Router, React 19, zod 4, vitest 3, Tailwind 4, sonner.

**Covers audit findings:** F1, F2, F3, F4, F5.

---

## Global constraints

Read [README.md § Global constraints](README.md#global-constraints-apply-to-every-phase-every-task) first. The ones that bite in this phase:

- `notifyError(result: ClientResult<unknown>, override?: string)` takes a **ClientResult, not a string**. For a local validation string use `notifyGenericError(err)`.
- Do not change the API envelope or any error `code`. Route tests assert on `code` + `status`.
- Do not switch `type="number"` inputs to `type="text"` — form state and numeric parsing assume number inputs.
- Never `npm run db:migrate`. No task in this phase touches the schema.
- Run tests as `npm run test -- --testTimeout=30000`.

---

## Pre-flight (do this before Task 1)

- [ ] **P0.1** Confirm a clean tree: `git status --short`. Expect at most `public/sw.js` (Serwist build artifact). If anything else is dirty, land or stash it first.
- [ ] **P0.2** Capture the green baseline:
  ```bash
  npm run lint && npm run test -- --testTimeout=30000 2>&1 | tail -30
  ```
  Save the pass/fail counts. Every task below must leave this at or above baseline.
- [ ] **P0.3** Create the branch: `git checkout -b phase-1-p0-user-facing`.

---

## File structure for this phase

| File | Change | Responsible for |
|---|---|---|
| `components/logs/EntryForm.tsx` | Modify | Surfacing per-field validation errors inline + as a toast; adding `inputMode` to split-labour inputs; associating split-labour labels |
| `components/logs/EntryForm.validate.test.ts` | **Create** | Pins `validate()` behaviour before it changes (no test exists today) |
| `components/logs/entryFieldRegistry.ts` | Modify | Adds optional `inputMode` to `EntryField` |
| `components/logs/entryFieldRegistry.test.ts` | Modify | Asserts the derived/explicit `inputMode` on every numeric field |
| `components/tools/ToolCategoryManager.tsx` | Modify | Replaces the last `window.prompt` in the repo with the existing `RenameModal` |
| `tests/ui/no-native-dialogs.test.ts` | **Create** | Regression fence: fails if `window.confirm`/`window.prompt` reappears anywhere |
| `lib/services/entries.ts` | Modify | Gains the pure `resolveMaterialUnit` |
| `lib/services/entries.test.ts` | Modify | Unit tests for `resolveMaterialUnit`, incl. every edge case |
| `app/api/entries/materials/route.ts` | Modify | Calls `resolveMaterialUnit` |
| `app/api/entries/materials/route.test.ts` | **Create** | **Coverage gap** — this route has no test today and Phase 1 changes it |
| `app/api/entries/[id]/route.ts` | Modify | Calls `resolveMaterialUnit`; drops the silent fallback |
| `app/api/entries/[id]/route.test.ts` | Modify | Adds unit-resolution cases alongside the existing workStage cases |
| `components/transfers/TransferForm.tsx` | Modify | Replaces the raw UUID input with `UnitSelect` |

---

## Task 1 — Pin `validate()` before touching it (F1, part 1)

`EntryForm.validate()` has **zero test coverage** today. Changing untested validation logic is how P0 fixes become P0 bugs. Write the test first.

**Files:**
- Create: `components/logs/EntryForm.validate.test.ts`
- Modify: `components/logs/EntryForm.tsx` (extract `validate` so it is testable)

**Interfaces:**
- Produces: `export function validateEntryValues(input: { fields: EntryField[]; values: Record<string, FieldValue>; siteId: string | null; isEdit: boolean; splitLabour: boolean }): { field: string; message: string } | null` — a pure function. Task 2 renders its result; Task 3 does not use it.

**Why extract:** `validate()` is currently a closure over component state (`EntryForm.tsx:143-167`), untestable without rendering. There is no React testing library in this repo (`package.json` devDependencies has vitest + Playwright only, **no** `@testing-library/react`), so a pure extraction is the only way to unit-test it without adding a dependency. Extraction is also a prerequisite for Task 2's per-field errors, which need the *field name*, not just a message.

- [ ] **Step 1: Write the failing test**

Create `components/logs/EntryForm.validate.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { EntryField } from "./entryFieldRegistry";
import { validateEntryValues } from "./EntryForm.validate";

const dateField: EntryField = { name: "date", label: "Date", kind: "date", required: true };
const workTypeField: EntryField = {
  name: "workType", label: "Work Type", kind: "subcategory", required: true, subcategoryHint: "labour",
};
const peopleField: EntryField = {
  name: "peopleCount", label: "People Count", kind: "number", required: true, min: 1, max: 10000, step: 1,
};
const wageField: EntryField = {
  name: "wagePerHead", label: "Per Head Salary", kind: "number", required: true, min: 0.01, step: 0.01,
};
const remarksField: EntryField = { name: "remarks", label: "Remarks", kind: "textarea" };

const base = {
  fields: [dateField, workTypeField, peopleField, wageField, remarksField],
  values: {
    date: "2026-08-06",
    workType: { subcategoryId: "s1", name: "Masonry" },
    peopleCount: "4",
    wagePerHead: "600",
    remarks: "",
  } as Record<string, unknown>,
  siteId: "site-1" as string | null,
  isEdit: false,
  splitLabour: false,
};

describe("validateEntryValues", () => {
  it("returns null when every required field is filled", () => {
    expect(validateEntryValues(base)).toBeNull();
  });

  it("requires a site on create", () => {
    expect(validateEntryValues({ ...base, siteId: null })).toEqual({
      field: "siteId",
      message: "Site is required",
    });
  });

  it("does not require a site on edit", () => {
    expect(validateEntryValues({ ...base, siteId: null, isEdit: true })).toBeNull();
  });

  it("reports the first missing required field by name and label", () => {
    expect(
      validateEntryValues({ ...base, values: { ...base.values, workType: null } }),
    ).toEqual({ field: "workType", message: "Work Type is required" });
  });

  it("treats empty string as missing for scalar fields", () => {
    expect(
      validateEntryValues({ ...base, values: { ...base.values, peopleCount: "" } }),
    ).toEqual({ field: "peopleCount", message: "People Count is required" });
  });

  it("treats null and undefined as missing for scalar fields", () => {
    expect(
      validateEntryValues({ ...base, values: { ...base.values, peopleCount: null } }),
    ).toEqual({ field: "peopleCount", message: "People Count is required" });
    expect(
      validateEntryValues({ ...base, values: { ...base.values, peopleCount: undefined } }),
    ).toEqual({ field: "peopleCount", message: "People Count is required" });
  });

  it("ignores optional fields left blank", () => {
    expect(validateEntryValues({ ...base, values: { ...base.values, remarks: "" } })).toBeNull();
  });

  it("skips peopleCount/wagePerHead when the work type is a split-labour type", () => {
    expect(
      validateEntryValues({
        ...base,
        splitLabour: true,
        values: { ...base.values, peopleCount: "", wagePerHead: "", masonCount: "3" },
      }),
    ).toBeNull();
  });

  it("requires at least one mason or helper value when split labour is active", () => {
    expect(
      validateEntryValues({
        ...base,
        splitLabour: true,
        values: {
          ...base.values,
          peopleCount: "", wagePerHead: "",
          masonCount: "0", masonSalaryAmount: "0", helperCount: "0", helperSalaryAmount: "0",
        },
      }),
    ).toEqual({ field: "masonCount", message: "Mason or Helper values are required" });
  });

  it("accepts a helper-only split entry", () => {
    expect(
      validateEntryValues({
        ...base,
        splitLabour: true,
        values: { ...base.values, peopleCount: "", wagePerHead: "", helperCount: "2", helperSalaryAmount: "900" },
      }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npm run test -- --testTimeout=30000 components/logs/EntryForm.validate.test.ts
```
Expected: FAIL — `Failed to resolve import "./EntryForm.validate"`.

- [ ] **Step 3: Create the pure module**

Create `components/logs/EntryForm.validate.ts`:

```ts
import type { EntryField } from "./entryFieldRegistry";

export type ValidationFailure = { field: string; message: string };

export type ValidateInput = {
  fields: EntryField[];
  values: Record<string, unknown>;
  siteId: string | null;
  isEdit: boolean;
  splitLabour: boolean;
};

// Pure mirror of the checks EntryForm used to run inline. Returns the FIRST
// failure so the form can focus that field; null when the form is submittable.
// Message strings are user-visible and are intentionally identical to the
// pre-extraction strings — changing them changes what supervisors read.
export function validateEntryValues(input: ValidateInput): ValidationFailure | null {
  const { fields, values, siteId, isEdit, splitLabour } = input;

  if (!siteId && !isEdit) {
    return { field: "siteId", message: "Site is required" };
  }

  for (const f of fields) {
    // Split-labour work types replace these two fields with the mason/helper
    // grid, so they are not required in that mode.
    if (splitLabour && (f.name === "peopleCount" || f.name === "wagePerHead")) continue;
    if (!f.required) continue;

    const v = values[f.name];
    if (f.kind === "subcategory" || f.kind === "unit") {
      // These hold an object (or null) — falsy means nothing was picked.
      if (!v) return { field: f.name, message: `${f.label} is required` };
      continue;
    }
    if (v === "" || v === null || v === undefined) {
      return { field: f.name, message: `${f.label} is required` };
    }
  }

  if (splitLabour) {
    const masonCount = Number(values.masonCount || 0);
    const masonSalaryAmount = Number(values.masonSalaryAmount || 0);
    const helperCount = Number(values.helperCount || 0);
    const helperSalaryAmount = Number(values.helperSalaryAmount || 0);
    if (masonCount <= 0 && masonSalaryAmount <= 0 && helperCount <= 0 && helperSalaryAmount <= 0) {
      // Anchored to masonCount so the form can scroll to the split grid.
      return { field: "masonCount", message: "Mason or Helper values are required" };
    }
  }

  return null;
}
```

- [ ] **Step 4: Run the test — expect PASS**

```bash
npm run test -- --testTimeout=30000 components/logs/EntryForm.validate.test.ts
```
Expected: 10 passed.

- [ ] **Step 5: Rewire `EntryForm` to the extracted function (behaviour unchanged)**

In `components/logs/EntryForm.tsx`:

1. Add the import next to the other local imports:
   ```ts
   import { validateEntryValues, type ValidationFailure } from "./EntryForm.validate";
   ```
2. Replace the whole `function validate(): string | null { … }` block (currently `:143-167`) with:
   ```ts
   function validate(): ValidationFailure | null {
     return validateEntryValues({ fields, values, siteId: siteId ?? null, isEdit, splitLabour });
   }
   ```
3. In `handleSubmit` (currently `:229-233`) change the narrowing only — the toast still fires generically in this step; Task 2 changes that:
   ```ts
   const err = validate();
   if (err) {
     notifyGenericError();
     return;
   }
   ```

**Edge case to preserve:** `siteId` in the component may be `undefined` (optional prop). `validateEntryValues` expects `string | null`, hence the `?? null`. Passing `undefined` would still be falsy and behave identically, but the explicit coercion keeps the signature honest.

- [ ] **Step 6: Verify nothing regressed**

```bash
npm run lint && npm run test -- --testTimeout=30000
```
Expected: lint exit 0; suite at baseline + 10 new passes.

- [ ] **Step 7: Commit**

```bash
git add components/logs/EntryForm.validate.ts components/logs/EntryForm.validate.test.ts components/logs/EntryForm.tsx
git commit -m "test(logs): extract and pin EntryForm validation as a pure function"
```

---

## Task 2 — Surface the validation message inline and in the toast (F1, part 2)

**Files:**
- Modify: `components/logs/EntryForm.tsx`

**Interfaces:**
- Consumes: `validateEntryValues` / `ValidationFailure` from Task 1.
- Produces: nothing consumed by later tasks.

**The defect:** a supervisor who leaves one field blank on a 488-line multi-field form sees only "Something went wrong". They have no way to learn which field.

**The fix, in two layers:** (a) the toast carries the real message; (b) the offending field renders the message underneath itself and the form scrolls to it. Both are needed — the toast is what a user notices, the inline text is what tells them where.

- [ ] **Step 1: Add error state and pass it through**

In `EntryForm.tsx`, near the other `useState` declarations, add:

```ts
const [fieldError, setFieldError] = useState<ValidationFailure | null>(null);
```

- [ ] **Step 2: Use the message in the submit handler**

Replace the `handleSubmit` preamble:

```ts
async function handleSubmit(e: FormEvent) {
  e.preventDefault();
  const err = validate();
  if (err) {
    setFieldError(err);
    // notifyGenericError is the string escape hatch (notifyError needs a
    // ClientResult). The message comes from our own validator, never a backend
    // string, so toast discipline is preserved.
    notifyGenericError(err.message);
    // Bring the offending field into view — on a long form the inline error is
    // otherwise off-screen. `siteId` has no rendered input, so guard the lookup.
    if (typeof document !== "undefined") {
      const el = document.getElementById(`field-${err.field}`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      (el as HTMLElement | null)?.focus?.({ preventScroll: true });
    }
    return;
  }
  setFieldError(null);
  setSubmitting(true);
  // …unchanged from here
```

**Edge cases handled:** `document` guard for any SSR/prerender path; optional chaining because `field-siteId` and `field-masonCount` may not resolve to a focusable element; `preventScroll` so focus does not fight the smooth scroll.

- [ ] **Step 3: Clear the error when the user edits the offending field**

Find the `update(name, val)` helper the field rows call (the function passed as `update` to `SplitLabourFields` and used by `FieldRow`'s `onChange`) and add a first line:

```ts
function update(name: string, val: FieldValue) {
  // Any edit to the field we complained about clears the complaint — leaving a
  // stale "X is required" under a now-filled field is worse than no message.
  setFieldError((prev) => (prev && (prev.field === name || prev.field === "masonCount") ? null : prev));
  // …existing body unchanged
}
```

The `masonCount` special case covers the split-labour aggregate error, which is anchored to `masonCount` but satisfied by editing any of the four split fields.

- [ ] **Step 4: Render the error inside `FieldRow`**

`FieldRow` already owns every label/input pairing (`EntryForm.tsx:378-445`) and already sets `id={id}` on its inputs. Add an `error` prop and one render slot rather than forking a second renderer.

Change the `FieldRow` props type to include:
```ts
error?: string;
```

At each of the four return branches (`subcategory`/`unit` delegate, `select`, `textarea`, and the default input), wrap the existing `<div className="flex flex-col gap-2">` content so the error renders last. The minimal edit that covers all branches: give the component a single wrapper. Replace the component's four `return (…)` statements' outer `<div className="flex flex-col gap-2">` with `<Field error={error} id={id}>` where:

```tsx
function Field({ id, error, children }: { id: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2" id={`field-${id.replace(/^entry-/, "")}`}>
      {children}
      {error ? (
        // 12px floor per F17 — this is content a user must read, not decoration.
        <p role="alert" className="text-xs font-semibold text-rose-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

If `FieldRow`'s `id` is not already of the form `entry-<name>`, use whatever prefix it does use and adjust the `replace` accordingly — the only requirement is that `document.getElementById('field-' + err.field)` in Step 2 resolves. Verify by reading the `id` construction at the top of `FieldRow` before editing.

For the `subcategory`/`unit` branch, `FieldRow` delegates to `SubcategoryCombobox` / `UnitSelect`, which render their own label. Wrap the delegate in the same `Field` so the anchor id and error slot exist there too.

- [ ] **Step 5: Pass the error down at the call site**

Where `EntryForm` maps `fields` to `<FieldRow …/>`, add:

```tsx
error={fieldError?.field === f.name ? fieldError.message : undefined}
```

And for the split-labour block, pass the aggregate message into `SplitLabourFields`:

```tsx
<SplitLabourFields
  values={values}
  update={update}
  error={fieldError?.field === "masonCount" ? fieldError.message : undefined}
/>
```

In `SplitLabourFields`, render it once above the two sections, wrapped in an element with `id="field-masonCount"`:

```tsx
{error ? (
  <p id="field-masonCount" role="alert" className="md:col-span-2 text-xs font-semibold text-rose-400">
    {error}
  </p>
) : (
  <span id="field-masonCount" className="hidden" aria-hidden="true" />
)}
```

The hidden span keeps the scroll anchor resolvable even before the first failure paints — without it, `getElementById` in Step 2 returns null on the very first submit because React has not yet rendered the error node.

- [ ] **Step 6: Verify**

```bash
npm run lint && npm run test -- --testTimeout=30000
```

Manual (dev server, mobile viewport 375 px):
```bash
npm run dev
```
- Open a new Labour entry, leave **Work Type** empty, submit → toast reads "Work Type is required" (not "Something went wrong"), the Work Type row shows the message in rose, and the page scrolls to it.
- Type into Work Type → the inline message disappears.
- Pick Plastering (split labour), leave all four mason/helper fields at 0, submit → "Mason or Helper values are required" appears above the split grid.
- Fill everything correctly → submits, no error rendered, existing success toast + redirect unchanged.

- [ ] **Step 7: Commit**

```bash
git add components/logs/EntryForm.tsx
git commit -m "fix(logs): surface EntryForm validation messages inline and in the toast"
```

---

## Task 3 — Replace the last native dialog and fence it (F2)

**Files:**
- Modify: `components/tools/ToolCategoryManager.tsx`
- Create: `tests/ui/no-native-dialogs.test.ts`

**Scope correction (verified 2026-08-06):** four of the five call sites the audit lists were already migrated to `confirmDialog` (`EntryForm.tsx:262`, `CategoryPicker.tsx:139`, `SubcategoryCombobox.tsx:155`, `ToolCatalogManager.tsx:85,97`). The only native dialog left in the repo is **`window.prompt` at `components/tools/ToolCategoryManager.tsx:47`**. A purpose-built `components/catalog/RenameModal.tsx` already exists and its header comment says it replaces `window.prompt` — this is a drop-in.

`RenameModal`'s verified contract:
```ts
type Props = {
  open: boolean;
  noun: string;             // e.g. "Tool Category"
  currentName: string;
  onClose: () => void;
  onSubmit: (nextName: string) => Promise<boolean>;  // true → modal closes
};
```

- [ ] **Step 1: Write the failing regression test**

Create `tests/ui/no-native-dialogs.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

// Native window.confirm / window.prompt are unstyled, ignore safe-area insets,
// and are silently suppressed by some engines inside installed PWAs — a
// destructive action then never confirms. The app has branded replacements
// (lib/ui/confirm.tsx, components/catalog/RenameModal.tsx); this test is the
// fence that stops the native versions creeping back in.
function walkFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const next = stack.pop();
    if (!next) continue;
    for (const name of readdirSync(next)) {
      if (name === ".next" || name === "node_modules" || name === ".git") continue;
      const abs = path.join(next, name);
      if (statSync(abs).isDirectory()) { stack.push(abs); continue; }
      if (!/\.(ts|tsx)$/.test(name)) continue;
      out.push(abs);
    }
  }
  return out;
}

describe("native dialogs", () => {
  test("no window.confirm or window.prompt in app code", () => {
    const repoRoot = path.resolve(__dirname, "..", "..");
    const files = ["app", "components", "lib"].flatMap((part) => {
      try { return walkFiles(path.join(repoRoot, part)); } catch { return []; }
    });

    const offenders = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      // Ignore comment lines — RenameModal's header legitimately mentions the API.
      return source
        .split("\n")
        .some((line) => !line.trim().startsWith("//") && /window\.(confirm|prompt)\s*\(/.test(line));
    });

    expect(offenders.map((f) => path.relative(repoRoot, f))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

```bash
npm run test -- --testTimeout=30000 tests/ui/no-native-dialogs.test.ts
```
Expected: FAIL listing `components/tools/ToolCategoryManager.tsx`.

- [ ] **Step 3: Wire `RenameModal` into `ToolCategoryManager`**

In `components/tools/ToolCategoryManager.tsx`:

1. Import:
   ```ts
   import { RenameModal } from "@/components/catalog/RenameModal";
   ```
2. Add state next to `busyId`:
   ```ts
   const [renaming, setRenaming] = useState<ToolCategoryDTO | null>(null);
   ```
3. Replace the whole `rename` function (currently `:46-50`):
   ```ts
   function rename(cat: ToolCategoryDTO) {
     setRenaming(cat);
   }

   // Returns true so RenameModal closes only on a successful PATCH; on failure
   // the modal stays open with the user's text intact.
   async function submitRename(nextName: string): Promise<boolean> {
     const cat = renaming;
     if (!cat) return true;
     setBusyId(cat.categoryId);
     const res = await updateCategory(cat.categoryId, { name: nextName });
     setBusyId(null);
     if (!res.ok) {
       notifyError(res);
       return false;
     }
     toast.success(`Renamed to "${nextName}"`);
     await mutate();
     return true;
   }
   ```
   Note this deliberately does **not** reuse the existing `patch()` helper: `patch` cannot report success/failure back to the modal, and swallowing that would leave the modal open forever on error.
4. Render the modal once, at the end of the component's returned JSX (inside the outermost element, after the table/list):
   ```tsx
   <RenameModal
     open={renaming !== null}
     noun="Tool Category"
     currentName={renaming?.name ?? ""}
     onClose={() => setRenaming(null)}
     onSubmit={submitRename}
   />
   ```

**Edge cases preserved from the old code:** the old `rename` bailed on empty input and on an unchanged name. `RenameModal` enforces both itself (`canSave = trimmed.length > 0 && trimmed !== currentName && !saving`, verified at `RenameModal.tsx:36`), so no extra guard is needed — but do not delete those semantics by adding your own bypass.

- [ ] **Step 4: Run the fence test — expect PASS**

```bash
npm run test -- --testTimeout=30000 tests/ui/no-native-dialogs.test.ts
```

- [ ] **Step 5: Full verification**

```bash
npm run lint && npm run test -- --testTimeout=30000
```

Manual: open the tools categories admin screen, rename a category → branded modal, Enter submits, Escape cancels, an API failure keeps the modal open with a toast.

- [ ] **Step 6: Commit**

```bash
git add components/tools/ToolCategoryManager.tsx tests/ui/no-native-dialogs.test.ts
git commit -m "fix(tools): replace window.prompt rename with RenameModal; fence native dialogs"
```

---

## Task 4 — `inputMode` on every numeric input (F3)

**Files:**
- Modify: `components/logs/entryFieldRegistry.ts`
- Modify: `components/logs/entryFieldRegistry.test.ts`
- Modify: `components/logs/EntryForm.tsx`
- Modify: `components/transfers/TransferForm.tsx`

**Interfaces:**
- Produces: `EntryField.inputMode?: "numeric" | "decimal"` and `export function numericInputModeFor(field: EntryField): "numeric" | "decimal" | undefined` — consumed by `EntryForm`'s number renderer and, in Phase 3, by the descriptor.

**The defect:** `type="number"` alone yields inconsistent mobile keyboards. A supervisor entering a wage gets a full alphabetic keyboard on some Android builds. Zero `inputMode` attributes exist repo-wide (verified by grep).

**The rule:** `step === 1` → whole numbers → `"numeric"`. Anything else numeric (`step: 0.01`, `step: 0.1`, or no step) → `"decimal"`. Explicit `field.inputMode` always wins.

- [ ] **Step 1: Write the failing test**

Append to `components/logs/entryFieldRegistry.test.ts`:

```ts
import { numericInputModeFor, resolveEntryFields } from "./entryFieldRegistry";

describe("numericInputModeFor", () => {
  it("returns undefined for non-numeric fields", () => {
    expect(numericInputModeFor({ name: "remarks", label: "Remarks", kind: "textarea" })).toBeUndefined();
    expect(numericInputModeFor({ name: "date", label: "Date", kind: "date" })).toBeUndefined();
  });

  it("returns numeric for whole-number fields (step 1)", () => {
    expect(
      numericInputModeFor({ name: "peopleCount", label: "People Count", kind: "number", step: 1 }),
    ).toBe("numeric");
  });

  it("returns decimal for fractional fields", () => {
    expect(
      numericInputModeFor({ name: "wagePerHead", label: "Per Head Salary", kind: "number", step: 0.01 }),
    ).toBe("decimal");
    expect(
      numericInputModeFor({ name: "hoursActive", label: "Hours Active", kind: "number", step: 0.1 }),
    ).toBe("decimal");
  });

  it("defaults an unstepped number field to decimal", () => {
    expect(numericInputModeFor({ name: "quantity", label: "Quantity", kind: "number" })).toBe("decimal");
  });

  it("honours an explicit inputMode override", () => {
    expect(
      numericInputModeFor({ name: "count", label: "Count", kind: "number", step: 0.01, inputMode: "numeric" }),
    ).toBe("numeric");
  });

  it("assigns an inputMode to every numeric field in the registry", () => {
    for (const category of ["labour", "material", "machinery", "expense", "incident"]) {
      for (const field of resolveEntryFields(category)) {
        if (field.kind !== "number") continue;
        expect(numericInputModeFor(field), `${category}.${field.name}`).toBeDefined();
      }
    }
  });

  it("maps the known registry fields to the expected keyboards", () => {
    const byName = (cat: string, name: string) =>
      numericInputModeFor(resolveEntryFields(cat).find((f) => f.name === name)!);
    expect(byName("labour", "peopleCount")).toBe("numeric");
    expect(byName("labour", "wagePerHead")).toBe("decimal");
    expect(byName("material", "quantity")).toBe("decimal");
    expect(byName("material", "cost")).toBe("decimal");
    expect(byName("machinery", "count")).toBe("numeric");
    expect(byName("machinery", "hoursActive")).toBe("decimal");
    expect(byName("machinery", "totalCost")).toBe("decimal");
    expect(byName("expense", "amount")).toBe("decimal");
    expect(byName("incident", "durationEstimate")).toBe("numeric");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

```bash
npm run test -- --testTimeout=30000 components/logs/entryFieldRegistry.test.ts
```
Expected: FAIL — `numericInputModeFor` is not exported.

- [ ] **Step 3: Implement**

In `components/logs/entryFieldRegistry.ts`, extend the `EntryField` type (after `step?: number;`):

```ts
  // Mobile keyboard hint. Derived from `step` when omitted: whole-number fields
  // get the numeric pad, money/quantity fields get the decimal pad. Set
  // explicitly only when the derivation is wrong for a specific field.
  inputMode?: "numeric" | "decimal";
```

And append the resolver:

```ts
export function numericInputModeFor(field: EntryField): "numeric" | "decimal" | undefined {
  if (field.kind !== "number") return undefined;
  if (field.inputMode) return field.inputMode;
  return field.step === 1 ? "numeric" : "decimal";
}
```

No registry entries need changing — the derivation already produces the right answer for all nine numeric fields (asserted by the last test above).

- [ ] **Step 4: Run — expect PASS**

```bash
npm run test -- --testTimeout=30000 components/logs/entryFieldRegistry.test.ts
```

- [ ] **Step 5: Apply it in the renderers**

`components/logs/EntryForm.tsx`, the default input branch (currently `:431-442`) — add the import and the attribute:

```ts
import { numericInputModeFor } from "./entryFieldRegistry";
```

```tsx
<input
  id={id}
  type={field.kind === "number" ? "number" : field.kind === "date" ? "date" : "text"}
  inputMode={numericInputModeFor(field)}
  value={String(value ?? "")}
  onChange={(e) => onChange(e.target.value)}
  min={field.min}
  max={field.max}
  step={field.step}
  placeholder={field.placeholder}
  required={field.required}
  className={inputClass}
/>
```

`SplitLabourFields` (same file, `:464` and `:475`) — these are hand-written inputs outside the registry:

```tsx
// Count input
<input type="number" inputMode="numeric" min={0} step={1} … />
// Salary Amount input
<input type="number" inputMode="decimal" min={0} step="0.01" … />
```

While here, fix the F20 label-association defect in the same two blocks (they use bare `<label>` with no `htmlFor`) — it is the same three-line edit and touching the file twice is waste:

```tsx
<label htmlFor={`split-${countName}`} className={labelClass}>Count</label>
<input id={`split-${countName}`} type="number" inputMode="numeric" … />
```
```tsx
<label htmlFor={`split-${amountName}`} className={labelClass}>Salary Amount</label>
<input id={`split-${amountName}`} type="number" inputMode="decimal" … />
```

`components/transfers/TransferForm.tsx` — the quantity input (around `:226`):

```tsx
<input type="number" inputMode="decimal" … />
```

- [ ] **Step 6: Sweep for any remaining `type="number"` without `inputMode`**

```bash
grep -rn 'type="number"' components app --include="*.tsx" | grep -v inputMode
```
Expected output: empty. If any remain, add `inputMode="decimal"` for money/quantity and `"numeric"` for counts, then re-run.

- [ ] **Step 7: Verify**

```bash
npm run lint && npm run test -- --testTimeout=30000
```
Manual on a real phone or Chrome DevTools device emulation: focus People Count → numeric pad; focus Per Head Salary → decimal pad with a `.` key.

- [ ] **Step 8: Commit**

```bash
git add components/logs/entryFieldRegistry.ts components/logs/entryFieldRegistry.test.ts components/logs/EntryForm.tsx components/transfers/TransferForm.tsx
git commit -m "fix(forms): add inputMode to every numeric input and associate split-labour labels"
```

---

## Task 5 — Extract `resolveMaterialUnit` (F4, part 1)

**Files:**
- Modify: `lib/services/entries.ts`
- Modify: `lib/services/entries.test.ts`

**Interfaces:**
- Consumes: `MaterialUnitRule` from `@/lib/db/queries/materialUnits` (a pure, client-safe module — verified, it imports nothing DB-related).
- Produces:
  ```ts
  export type UnitCandidate = { unitId: string; label: string };
  export type ResolveUnitResult =
    | { ok: true; unitId: string; unitName: string }
    | { ok: false; message: string };
  export function resolveMaterialUnit(input: {
    materialType: string;
    rule: MaterialUnitRule;
    submittedUnitName: string;
    activeUnits: UnitCandidate[];
  }): ResolveUnitResult;
  ```
  Tasks 6 and 7 both call this.

**The behavioural decision — made here, once.** Today the create route rejects an unresolvable unit with 400 while the update route silently substitutes `rule.preferredName`. **Standardise on reject (400).** Rationale: a silent substitution changes a *stored* unit during an edit without telling the user, so a quantity recorded in Bags can become Tonnes with no signal — a data-integrity bug, not a convenience. Verified today: **no test pins the fallback** (`app/api/entries/[id]/route.test.ts` is 93 lines and covers only `workStage` catalog checks), so this decision is unconstrained.

**The one deliberate exception preserved:** when the rule allows exactly one unit, that unit is auto-assigned regardless of what the client submitted. Both routes do this today and the client relies on it (`EntryForm.buildPayload()` `:221-223` auto-fills the unit in that case).

- [ ] **Step 1: Write the failing tests**

Append to `lib/services/entries.test.ts`:

```ts
import { resolveMaterialUnit } from "./entries";

const units = [
  { unitId: "u-bag", label: "Bag" },
  { unitId: "u-tonne", label: "Tonne" },
  { unitId: "u-kg", label: "kilogram" }, // display-normalises to "KG"
];

describe("resolveMaterialUnit", () => {
  it("auto-assigns the only allowed unit, ignoring what was submitted", () => {
    expect(
      resolveMaterialUnit({
        materialType: "Cement",
        rule: { allowedNames: ["Bag"], preferredName: "Bag" },
        submittedUnitName: "Tonne",
        activeUnits: units,
      }),
    ).toEqual({ ok: true, unitId: "u-bag", unitName: "Bag" });
  });

  it("accepts a submitted unit that is in the allowed list", () => {
    expect(
      resolveMaterialUnit({
        materialType: "Sand",
        rule: { allowedNames: ["Tonne", "CFT"], preferredName: "Tonne" },
        submittedUnitName: "Tonne",
        activeUnits: units,
      }),
    ).toEqual({ ok: true, unitId: "u-tonne", unitName: "Tonne" });
  });

  it("rejects a submitted unit that is not allowed — no silent fallback", () => {
    const result = resolveMaterialUnit({
      materialType: "Sand",
      rule: { allowedNames: ["Tonne", "CFT"], preferredName: "Tonne" },
      submittedUnitName: "Bag",
      activeUnits: units,
    });
    expect(result).toEqual({ ok: false, message: "Sand must use Tonne or CFT as the unit" });
  });

  it("rejects an empty submission when more than one unit is allowed", () => {
    expect(
      resolveMaterialUnit({
        materialType: "Sand",
        rule: { allowedNames: ["Tonne", "CFT"], preferredName: "Tonne" },
        submittedUnitName: "",
        activeUnits: units,
      }),
    ).toEqual({ ok: false, message: "Sand must use Tonne or CFT as the unit" });
  });

  it("rejects when the allowed unit is not among the active units", () => {
    expect(
      resolveMaterialUnit({
        materialType: "Sand",
        rule: { allowedNames: ["CFT"], preferredName: "CFT" },
        submittedUnitName: "CFT",
        activeUnits: units, // no CFT row
      }),
    ).toEqual({ ok: false, message: "Sand must use CFT as the unit" });
  });

  it("rejects when the rule allows nothing", () => {
    expect(
      resolveMaterialUnit({
        materialType: "Ghost",
        rule: { allowedNames: [], preferredName: null },
        submittedUnitName: "Bag",
        activeUnits: units,
      }),
    ).toEqual({ ok: false, message: "Ghost must use  as the unit" });
  });

  it("matches units through display normalisation", () => {
    expect(
      resolveMaterialUnit({
        materialType: "Steel",
        rule: { allowedNames: ["KG"], preferredName: "KG" },
        submittedUnitName: "kilogram",
        activeUnits: units,
      }),
    ).toEqual({ ok: true, unitId: "u-kg", unitName: "KG" });
  });

  it("is case/whitespace tolerant on the submitted name via displayUnitName", () => {
    expect(
      resolveMaterialUnit({
        materialType: "Steel",
        rule: { allowedNames: ["KG", "Tonne"], preferredName: "KG" },
        submittedUnitName: "  KG  ",
        activeUnits: units,
      }),
    ).toEqual({ ok: true, unitId: "u-kg", unitName: "KG" });
  });
});
```

Note the sixth case: with an empty `allowedNames`, `join(" or ")` yields `""` and the message reads `"Ghost must use  as the unit"` — awkward but **byte-identical to today's behaviour**. Keeping the exact string is deliberate: changing it is a separate, user-visible copy change that belongs in a copy PR, not a refactor. It is called out in the phase's follow-up list.

- [ ] **Step 2: Run — expect FAIL**

```bash
npm run test -- --testTimeout=30000 lib/services/entries.test.ts
```
Expected: FAIL — `resolveMaterialUnit` is not exported.

- [ ] **Step 3: Implement**

Append to `lib/services/entries.ts` (and add the import at the top):

```ts
import { displayUnitName, type MaterialUnitRule } from "@/lib/db/queries/materialUnits";
```

```ts
export type UnitCandidate = { unitId: string; label: string };

export type ResolveUnitResult =
  | { ok: true; unitId: string; unitName: string }
  | { ok: false; message: string };

// Single home for "which unit may this material be logged in?". Previously
// re-implemented in the create route and the update route, which had DRIFTED:
// create rejected an unresolvable unit, update silently substituted the
// preferred one — so an entry could be edited into a state creation rejects.
// Standardised on reject: silently rewriting a stored unit is a data-integrity
// bug, not a convenience.
//
// Pure (no DB): the caller supplies the rule and the active unit rows.
export function resolveMaterialUnit(input: {
  materialType: string;
  rule: MaterialUnitRule;
  submittedUnitName: string;
  activeUnits: UnitCandidate[];
}): ResolveUnitResult {
  const { materialType, rule, submittedUnitName, activeUnits } = input;

  const submitted = displayUnitName(submittedUnitName ?? "");
  // Exactly one allowed unit → auto-assign it, whatever the client sent. Both
  // routes have always done this and the entry form depends on it.
  const targetName =
    rule.allowedNames.length === 1
      ? rule.preferredName
      : rule.allowedNames.includes(submitted)
        ? submitted
        : null;

  const match = targetName
    ? activeUnits.find((unit) => displayUnitName(unit.label) === targetName)
    : undefined;

  if (!targetName || !match) {
    return {
      ok: false,
      // Exact legacy copy — asserted by route tests and seen by supervisors.
      message: `${materialType} must use ${rule.allowedNames.join(" or ")} as the unit`,
    };
  }

  return { ok: true, unitId: match.unitId, unitName: targetName };
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm run test -- --testTimeout=30000 lib/services/entries.test.ts
```
Expected: 8 new tests pass, existing `evaluateLabourSplit` / `decimalFieldsFor` tests unchanged.

- [ ] **Step 5: Commit**

```bash
git add lib/services/entries.ts lib/services/entries.test.ts
git commit -m "feat(services): add pure resolveMaterialUnit with reject-on-unresolvable semantics"
```

---

## Task 6 — Cover the materials create route, then rewire it (F4, part 2)

**Files:**
- Create: `app/api/entries/materials/route.test.ts`
- Modify: `app/api/entries/materials/route.ts`

**Coverage gap (verified):** the audit's regression map claims this route has a test. **It does not.** The entry route tests that exist are `labour`, `machinery`, `expenses`, and `[id]`. Since this task changes the materials route, the test must be written first.

- [ ] **Step 1: Read the sibling test to copy its mocking pattern**

```bash
sed -n '1,60p' app/api/entries/machinery/route.test.ts
```
Follow whatever mocking approach it uses for `@/lib/db/client`, `@/lib/auth/guards`, and `@/lib/validation/catalogList` — do **not** invent a new one. The test below assumes that pattern; adapt the mock block to match exactly what the sibling does.

- [ ] **Step 2: Write the failing test**

Create `app/api/entries/materials/route.test.ts` covering, at minimum:

```ts
// Cases this file must assert (adapt the mock scaffolding from machinery/route.test.ts):
//
// 1. happy path, multi-unit material: submitted unit is in allowedNames
//    → 201/200 success, insertMaterialEntry called with unitMode "master" and
//      the resolved unitMasterId, unitCustomId null.
// 2. single-allowed-unit material: client submits the WRONG unit
//    → success, and the stored unit is the rule's preferred one (auto-assign
//      is preserved — this is not the drift being fixed).
// 3. multi-unit material, submitted unit NOT allowed
//    → 400, ERROR_CODES.VALIDATION_ERROR,
//      message exactly `${materialType} must use ${allowed.join(" or ")} as the unit`.
// 4. no unit submitted at all on a multi-unit material
//    → 400 with the same message.
// 5. allowed unit exists in the rule but is inactive / absent from unit_master
//    → 400 with the same message (not a 500).
// 6. archived site → 404 "Site not found".
// 7. site supervised by someone else → 403
//    "You can only log entries for sites you supervise".
// 8. unauthenticated → the guard's error code/status passed through unchanged.
// 9. invalid workStage → 400 from assertInCatalogList, message unchanged.
```

Write these as real `it(...)` blocks with the sibling's mock scaffolding. Every assertion above is on behaviour that exists **today** — this test must pass against the unmodified route before you change anything.

- [ ] **Step 3: Run against the UNMODIFIED route — expect PASS**

```bash
npm run test -- --testTimeout=30000 app/api/entries/materials/route.test.ts
```
Expected: all pass. **If any fail, the test is wrong, not the route** — fix the test until it is green against current behaviour. This is the whole point: it is a characterisation test.

- [ ] **Step 4: Commit the characterisation test on its own**

```bash
git add app/api/entries/materials/route.test.ts
git commit -m "test(api): characterise the materials create route before refactor"
```

- [ ] **Step 5: Rewire the route to `resolveMaterialUnit`**

In `app/api/entries/materials/route.ts`, replace lines `66-97` (from `const activeUnits = await db` through the closing brace of the `if (!resolvedUnitName || !resolvedUnit)` block) with:

```ts
    const activeUnits = await db
      .select({ unitId: unitMaster.unitId, label: unitMaster.label })
      .from(unitMaster)
      .where(eq(unitMaster.isActive, true));

    let submittedUnitName = "";
    if ("unitMasterId" in validation.data && validation.data.unitMasterId) {
      const submittedUnitMasterId = validation.data.unitMasterId;
      submittedUnitName =
        activeUnits.find((unit) => unit.unitId === submittedUnitMasterId)?.label ?? "";
    } else if ("unit" in validation.data && validation.data.unit) {
      submittedUnitName = validation.data.unit;
    }

    const resolved = resolveMaterialUnit({
      materialType,
      rule: unitRule,
      submittedUnitName,
      activeUnits,
    });
    if (!resolved.ok) {
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, resolved.message, 400, undefined, requestId);
    }
```

Add the import:
```ts
import { resolveMaterialUnit } from "@/lib/services/entries";
```

Then update the insert call to use the new names — replace `unitMasterId: resolvedUnit.unitId` with `unitMasterId: resolved.unitId`, and wherever `resolvedUnitName` was used for the `unit` column, use `resolved.unitName`.

**Note the `displayUnitName` change:** the old code called `displayUnitName(...)` when deriving `submittedUnitName`; `resolveMaterialUnit` now does that normalisation internally. Passing the raw label is correct and avoids double-normalising. Remove the now-unused `displayUnitName` import **only if nothing else in the file uses it** — check with `grep -n displayUnitName app/api/entries/materials/route.ts`.

- [ ] **Step 6: Run the characterisation test — expect PASS, unchanged**

```bash
npm run test -- --testTimeout=30000 app/api/entries/materials/route.test.ts
```
Expected: identical results to Step 3. Any difference is a behaviour change you did not intend — revert and re-read.

- [ ] **Step 7: Verify + commit**

```bash
npm run lint && npm run test -- --testTimeout=30000
git add app/api/entries/materials/route.ts
git commit -m "refactor(api): materials create route uses shared resolveMaterialUnit"
```

---

## Task 7 — End the drift in the update route (F4, part 3)

**Files:**
- Modify: `app/api/entries/[id]/route.ts`
- Modify: `app/api/entries/[id]/route.test.ts`

**This is the behaviour change.** After this task, editing an entry into an unresolvable unit returns 400 instead of silently rewriting the unit.

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block to `app/api/entries/[id]/route.test.ts`, using the mocking scaffolding already present in that file:

```ts
describe("PATCH material entries — unit resolution", () => {
  it("accepts a submitted unit that the material's rule allows", async () => {
    // → 200; updateEntryById called with unitMode "master", the resolved
    //   unitMasterId, unitCustomId null, and unit set to the resolved name.
  });

  it("auto-assigns when the material allows exactly one unit", async () => {
    // → 200; stored unit is the rule's preferred unit even though the client
    //   submitted a different one. (Unchanged behaviour.)
  });

  it("REJECTS an unallowed unit instead of silently falling back", async () => {
    // → 400, ERROR_CODES.VALIDATION_ERROR,
    //   message `${materialType} must use ${allowed.join(" or ")} as the unit`.
    // This is the drift fix: before this change the route substituted
    // unitRule.preferredName and returned 200.
  });

  it("resolves against the NEW materialType when the type is being changed", async () => {
    // Update sends materialType: "Cement" on a row currently "Sand".
    // → the rule looked up is Cement's, not Sand's.
  });

  it("keeps the existing unit when the update omits unit fields but changes materialType", async () => {
    // Existing row's unit is still submitted (falls back to material.unitMasterId
    // then material.unit) — if the new type disallows it, → 400.
  });

  it("does not touch unit fields when the update changes neither type nor unit", async () => {
    // e.g. { quantity: 5 } → the unit-resolution block is skipped entirely.
  });
});
```

Flesh each into a real test. The fifth and sixth cases guard the trigger condition at `route.ts:143-153` — a common refactor mistake is widening or narrowing which updates enter the block.

- [ ] **Step 2: Run — expect the third case to FAIL**

```bash
npm run test -- --testTimeout=30000 app/api/entries/\[id\]/route.test.ts
```
Expected: "REJECTS an unallowed unit" fails (route currently returns 200 with a substituted unit). The other five should pass against the unmodified route — if they don't, fix the tests first.

- [ ] **Step 3: Rewire the route**

In `app/api/entries/[id]/route.ts`, replace lines `163-202` (from `const unitRule = await materialUnitRuleFor(...)` through `updateData.unit = resolvedUnitName;`) with:

```ts
    const unitRule = await materialUnitRuleFor(targetMaterialType);
    const activeUnits = await db
      .select({ unitId: unitMaster.unitId, label: unitMaster.label })
      .from(unitMaster)
      .where(eq(unitMaster.isActive, true));

    // Precedence for "what unit did the user mean": an explicitly submitted
    // master id, else an explicitly submitted unit name, else whatever the row
    // already has. Unchanged from the pre-refactor code.
    const submittedUnitMasterId =
      typeof updateData.unitMasterId === "string"
        ? updateData.unitMasterId
        : typeof material.unitMasterId === "string"
          ? material.unitMasterId
          : "";
    const submittedUnitName = submittedUnitMasterId
      ? (activeUnits.find((unit) => unit.unitId === submittedUnitMasterId)?.label ?? "")
      : typeof updateData.unit === "string"
        ? updateData.unit
        : typeof material.unit === "string"
          ? material.unit
          : "";

    const resolved = resolveMaterialUnit({
      materialType: targetMaterialType,
      rule: unitRule,
      submittedUnitName,
      activeUnits,
    });
    if (!resolved.ok) {
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, resolved.message, 400, undefined, requestId);
    }

    updateData.unitMode = "master";
    updateData.unitMasterId = resolved.unitId;
    updateData.unitCustomId = null;
    updateData.unit = resolved.unitName;
```

Add the import (it may already exist for `evaluateLabourSplit` — extend that line):
```ts
import { coerceDecimals, decimalFieldsFor, evaluateLabourSplit, resolveMaterialUnit } from "@/lib/services/entries";
```
(match the file's actual existing import list; do not duplicate the specifier.)

Remove the now-unused `displayUnitName` import if nothing else in the file uses it.

- [ ] **Step 4: Run — expect all six PASS**

```bash
npm run test -- --testTimeout=30000 app/api/entries/\[id\]/route.test.ts
```

- [ ] **Step 5: Prove the drift is gone**

```bash
grep -n "preferredName" app/api/entries/materials/route.ts app/api/entries/\[id\]/route.ts
```
Expected: no matches in either route. `preferredName` should now only appear in `lib/db/queries/materialUnits.ts`, `lib/services/entries.ts`, and tests.

- [ ] **Step 6: Full verification + commit**

```bash
npm run lint && npm run test -- --testTimeout=30000
git add app/api/entries/\[id\]/route.ts app/api/entries/\[id\]/route.test.ts
git commit -m "fix(api): reject unresolvable material units on edit instead of silent fallback"
```

---

## Task 8 — Replace the transfer UUID field with a unit picker (F5)

**Files:**
- Modify: `components/transfers/TransferForm.tsx`

**The defect:** `TransferForm.tsx:217-218` asks a field supervisor to hand-type a raw UUID (`placeholder="Unit UUID"`, `required`). Material transfers are effectively unusable from a phone.

**Verified API compatibility — no server change needed.** `app/api/transfers/route.ts`'s `transferSchema` accepts **both** `unitMode: "master" | "custom"` with `unitMasterId` and `unitCustomId` (all `z.string().uuid().optional()`). The form currently hardcodes `unitMode: 'custom'`. `UnitSelect` returns `{ unitId, label, mode: "master" | "custom", name }` — exactly the shape needed to populate either branch. So the picker can offer master **and** custom units and the route accepts both.

- [ ] **Step 1: Swap the input for `UnitSelect`**

In `components/transfers/TransferForm.tsx`:

1. Import:
   ```ts
   import { UnitSelect, type UnitOption } from '@/components/logs/UnitSelect';
   ```
2. Replace the state:
   ```ts
   // was: const [unitCustomId, setUnitCustomId] = useState('');
   const [unit, setUnit] = useState<UnitOption | null>(null);
   ```
3. Replace the validation guard (currently `:85-88`):
   ```ts
   if (resourceType === 'Materials' && !unit) {
     toast.error('Select a unit for material transfers');
     return;
   }
   ```
4. Replace the payload branch (currently `:104-105`):
   ```ts
   payload.unitMode = unit!.mode;
   if (unit!.mode === 'master') payload.unitMasterId = unit!.unitId;
   else payload.unitCustomId = unit!.unitId;
   ```
   The non-null assertions are safe: the guard in step 3 returns before this line when `unit` is null, and this branch only runs for `resourceType === 'Materials'`. If you prefer no assertions, hoist `if (!unit) return;` immediately above.
5. Replace the JSX block at `:216-219` (the label + input) with:
   ```tsx
   <UnitSelect label="Unit" value={unit} onChange={setUnit} required />
   ```
   `UnitSelect` renders its own label in the same `text-[11px] uppercase tracking-widest` vocabulary the surrounding form uses, so the wrapper `<label>` must be **deleted**, not kept — leaving both produces two labels.

- [ ] **Step 2: Verify no other reference to `unitCustomId` survives in the component**

```bash
grep -n "unitCustomId" components/transfers/TransferForm.tsx
```
Expected: one match only — inside the payload branch from Step 1.4.

- [ ] **Step 3: Verify**

```bash
npm run lint && npm run test -- --testTimeout=30000
```

Manual, at 375 px width:
- Transfer form → resource type **Materials** → the Unit row is now a select populated with active master + custom units, no UUID anywhere.
- Submit → 200; check the created transfer row carries the chosen unit id in the correct column (`unit_master_id` for a master pick, `unit_custom_id` for a custom pick).
- Switch resource type to **Labour** → the unit row is not required and submission still succeeds.
- Approve the transfer from the approvals screen → unchanged behaviour (this is why the payload field names were kept identical).

- [ ] **Step 4: Commit**

```bash
git add components/transfers/TransferForm.tsx
git commit -m "fix(transfers): replace hand-typed unit UUID with UnitSelect picker"
```

---

## Phase regression checklist

Run every item. This is what protects the invariants in [README § Protected behaviour](README.md#protected-behaviour--must-not-regress-in-any-phase).

### Automated

- [ ] `npm run lint` → exit 0.
- [ ] `npm run test -- --testTimeout=30000` → green, and the pass count is **baseline + new tests** (Task 1: 10, Task 3: 1, Task 4: 7, Task 5: 8, Task 6: ≥9, Task 7: 6).
- [ ] `npm run test:e2e` → `smoke.spec.ts`, `route-migration.spec.ts`, `tools-inventory.spec.ts` green. `tools-inventory.spec.ts` covers the screen Task 3 changed — if it asserts on `window.prompt`, update it.
- [ ] `grep -rn 'type="number"' components app --include="*.tsx" | grep -v inputMode` → empty.
- [ ] `grep -rn "window\.\(confirm\|prompt\)(" app components lib` → empty (the new fence test also asserts this).
- [ ] `grep -rn "preferredName" app/api/` → empty.

### API-contract non-regression

- [ ] No file under `lib/errors/` was modified: `git diff --name-only main -- lib/errors/` → empty.
- [ ] Error codes and statuses unchanged: the only status this phase introduces is the **400 on the update route's unresolvable unit** (Task 7), which is the intended fix. Confirm no other status changed by reading `git diff main -- app/api/ | grep -n "errorResponse\|successResponse"`.
- [ ] Auth guard still present in every changed route: `grep -n 'in auth' app/api/entries/materials/route.ts app/api/entries/\[id\]/route.ts` → both present, unchanged.

### Security

- [ ] **No new user input reaches SQL.** `resolveMaterialUnit` is pure and takes already-fetched rows; the routes' `db.select()` calls are unchanged parameterised drizzle queries. Confirm with `git diff main -- app/api/entries/ | grep -n "sql\.\|sql\`"` → empty.
- [ ] **No new error text leaks internals.** The only new user-facing strings are the validation messages from `EntryForm.validate` (our own copy) and the unchanged unit message. `notifyGenericError(err.message)` is fed a locally-produced string, never a `ClientResult` body — verify at the Task 2 call site.
- [ ] **Ownership checks intact.** `checkOwnership` still gates the materials POST (`route.ts:62`) and the `[id]` PATCH (`:83`) and DELETE (`:241`). `grep -n checkOwnership app/api/entries/materials/route.ts app/api/entries/\[id\]/route.ts`.
- [ ] **Rate limiting untouched** — no change under `lib/rateLimit/` or `lib/http/withApi.ts`: `git diff --name-only main -- lib/rateLimit lib/http/withApi.ts` → empty.

### Performance

- [ ] **No new DB round-trips.** Tasks 6 and 7 replace inline logic with a pure function; the `db.select()` on `unit_master` that already existed in each route is still exactly one per request. Verify by counting: `grep -c "await db" app/api/entries/materials/route.ts` before and after should be identical.
- [ ] **No new client bundle weight.** `UnitSelect` (Task 8) was already in the client bundle via `EntryForm`; `RenameModal` (Task 3) was already imported by the catalog screens. No new dependency was added — confirm `git diff main -- package.json` is empty.
- [ ] **No new render loops.** Task 2's `setFieldError` is called only from `handleSubmit` and from `update()` behind a `prev &&` guard that returns the same reference when nothing changes, so it cannot cause a render cascade.

### Manual UX pass (375 px viewport, dark)

- [ ] Labour entry with a missing field → specific toast + inline rose message + scroll-to-field.
- [ ] Split-labour entry with all zeros → aggregate message above the grid.
- [ ] Numeric keyboards: People Count = numeric pad, Per Head Salary = decimal pad, Quantity = decimal pad.
- [ ] Tool category rename → branded modal (not a system prompt), Escape cancels, failure keeps it open.
- [ ] Material transfer → unit picker, no UUID field, submits and approves cleanly.
- [ ] Editing a material entry to an unallowed unit → a clear 400 toast, and the stored unit is **unchanged** (not silently rewritten). Re-open the entry to confirm.

---

## Known follow-ups this phase deliberately does NOT do

- The `"${materialType} must use  as the unit"` double-space message when a material has zero allowed units is preserved byte-for-byte. Fixing the copy is a separate, user-visible change — file it, don't smuggle it in.
- `validate()`'s messages and the zod messages in `lib/validation/schemas.ts` can still disagree. Unifying them is **F18**, handled in [Phase 3](phase-3-entry-type-descriptor.md), not here.
- The remaining audit F20 label-association gaps (`CategoryPicker` modal, `TransferForm` body) are left for [Phase 6](phase-6-dead-code-and-polish.md). Only the split-labour labels are fixed here, because Task 4 was already editing those exact lines.
