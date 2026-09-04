import { serverDescriptorFor } from "@/lib/entryTypes/server";
import type { EntryType } from "@/lib/types/entry";
import { displayUnitName, type MaterialUnitRule } from "@/lib/catalog/units";
import type { LabourEntryRow } from "@/lib/types/entry";
import { isSplitLabourWorkType } from "@/lib/validation/schemas";

// Decimal (string-backed) columns per entry type that the client sends as
// numbers. Pair with coerceDecimals() to stringify them before persisting.
// The list itself lives on the entry-type descriptor so there is one home for
// "what does a material entry look like" (audit F7/F18).
export function decimalFieldsFor(type: EntryType): readonly string[] {
  return serverDescriptorFor(type).decimalFields;
}

// SECURITY: mass-assignment control for entry updates. Drops the fields that
// must never change after creation, so a crafted PATCH body cannot reassign an
// entry to another site or another author.
//
// The deny-list is deliberately NOT per-type: it strips ALL five id fields on
// every update, so a labour PATCH cannot smuggle a materialEntryId. Narrowing
// it to the type's own id field would widen the attack surface.
export function stripImmutableEntryFields(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const {
    siteId: _siteId,
    createdBy: _createdBy,
    reportedBy: _reportedBy,
    labourEntryId: _labourId,
    materialEntryId: _materialId,
    machineryEntryId: _machineryId,
    expenseEntryId: _expenseId,
    incidentReportId: _incidentId,
    id: _id,
    ...safeData
  } = data;
  return safeData;
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
