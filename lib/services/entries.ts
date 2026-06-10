import type { EntryType } from "@/lib/db/queries/entries";
import type { LabourEntryRow } from "@/lib/types/entry";
import { isSplitLabourWorkType } from "@/lib/validation/schemas";

// Decimal (string-backed) columns per entry type that the client sends as
// numbers. Pair with coerceDecimals() to stringify them before persisting.
const DECIMAL_FIELDS: Record<EntryType, readonly string[]> = {
  expense: ["amount"],
  labour: ["wagePerHead", "salaryAmount", "masonSalaryAmount", "helperSalaryAmount"],
  material: ["quantity", "cost"],
  machinery: ["hoursActive", "totalCost"],
  incident: [],
};

export function decimalFieldsFor(type: EntryType): readonly string[] {
  return DECIMAL_FIELDS[type];
}

export type LabourSplitResult =
  | { ok: true; patch: Record<string, unknown> }
  | { ok: false; message: string };

// Split-labour rule: Mason/Helper columns only apply to split work types
// (Plastering/Brickwork). Given the existing row + the requested update, returns
// the extra columns to normalize, or a validation error. Pure (no DB) so it is
// unit-testable without HTTP.
export function evaluateLabourSplit(
  existing: LabourEntryRow,
  updateData: Record<string, unknown>,
): LabourSplitResult {
  const targetWorkType =
    typeof updateData.workType === "string"
      ? updateData.workType
      : typeof existing.workType === "string"
        ? existing.workType
        : "";
  const hasSplitUpdate =
    "masonCount" in updateData ||
    "masonSalaryAmount" in updateData ||
    "helperCount" in updateData ||
    "helperSalaryAmount" in updateData;
  const targetUsesSplit = isSplitLabourWorkType(targetWorkType);

  if (hasSplitUpdate && !targetUsesSplit) {
    return {
      ok: false,
      message: "Mason and Helper values are only supported for Plastering and Brickwork",
    };
  }

  const patch: Record<string, unknown> = {};
  if (targetUsesSplit && hasSplitUpdate) {
    patch.peopleCount = 0;
    patch.wagePerHead = "0";
    patch.salaryAmount = null;
  } else if (
    !targetUsesSplit &&
    ("workType" in updateData || "peopleCount" in updateData || "wagePerHead" in updateData)
  ) {
    patch.masonCount = null;
    patch.masonSalaryAmount = null;
    patch.helperCount = null;
    patch.helperSalaryAmount = null;
  }
  return { ok: true, patch };
}
