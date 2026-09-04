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
