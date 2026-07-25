import type { SubcategoryOption } from "./SubcategoryCombobox";
import type { EntryType } from "./entryTypes";
import type { UnitOption } from "./UnitSelect";

type AnyEntry = Record<string, unknown>;

function subOpt(
  customId: unknown,
  name: unknown,
  categoryId: string,
): SubcategoryOption | null {
  if (typeof customId === "string" && customId && typeof name === "string") {
    return { subcategoryId: customId, name, categoryId };
  }
  return null;
}

function unitOpt(entry: AnyEntry): UnitOption | null {
  const mode = entry.unitMode;
  const unitId = mode === "master" ? entry.unitMasterId : entry.unitCustomId;

  if (
    (mode === "master" || mode === "custom") &&
    typeof unitId === "string" &&
    typeof entry.unit === "string"
  ) {
    return {
      unitId,
      mode,
      name: entry.unit,
      label: entry.unit,
    };
  }

  return null;
}

export function mapEntryToFormValues(
  entry: AnyEntry,
  type: EntryType,
  categoryId: string,
): Record<string, unknown> {
  switch (type) {
    case "labour":
      return {
        date: entry.date ?? "",
        workType:
          subOpt(entry.workTypeCustomId, entry.workType, categoryId) ??
          (typeof entry.workType === "string" ? entry.workType : ""),
        peopleCount: entry.peopleCount ?? "",
        wagePerHead: entry.wagePerHead ?? "",
        salaryAmount: entry.salaryAmount ?? "",
        masonCount: entry.masonCount ?? "",
        masonSalaryAmount: entry.masonSalaryAmount ?? "",
        helperCount: entry.helperCount ?? "",
        helperSalaryAmount: entry.helperSalaryAmount ?? "",
        workStage: entry.workStage ?? "",
        remarks: entry.remarks ?? "",
      };
    case "material":
      return {
        date: entry.date ?? "",
        materialType:
          subOpt(entry.materialTypeCustomId, entry.materialType, categoryId) ??
          (typeof entry.materialType === "string" ? entry.materialType : ""),
        quantity: entry.quantity ?? "",
        unit: unitOpt(entry) ?? "",
        workStage: entry.workStage ?? "",
        cost: entry.cost ?? "",
        remarks: entry.remarks ?? "",
      };
    case "machinery":
      return {
        date: entry.date ?? "",
        equipmentType:
          subOpt(entry.equipmentTypeCustomId, entry.equipmentType, categoryId) ??
          (typeof entry.equipmentType === "string" ? entry.equipmentType : ""),
        count: entry.count ?? "",
        hoursActive: entry.hoursActive ?? "",
        totalCost: entry.totalCost ?? "",
        workStage: entry.workStage ?? "",
        remarks: entry.remarks ?? "",
      };
    case "expense":
      return {
        date: entry.date ?? "",
        category: entry.category ?? "",
        description: entry.description ?? "",
        workStage: entry.workStage ?? "",
        amount: entry.amount ?? "",
      };
    case "incident":
      return {
        incidentType: entry.incidentType ?? "",
        severity: entry.severity ?? "",
        description: entry.description ?? "",
        durationEstimate: entry.durationEstimate ?? "",
      };
    default:
      return {};
  }
}

export const ENTRY_TYPE_TO_CATEGORY_NAME: Record<EntryType, string> = {
  labour: "Labour",
  material: "Materials",
  machinery: "Machinery/Equipment",
  expense: "Expenses",
  incident: "Incident",
};
