import type { EntryType } from "./entries";

type LabourTotalInput = {
  peopleCount?: number | null;
  wagePerHead?: string | number | null;
  salaryAmount?: string | number | null;
  masonSalaryAmount?: string | number | null;
  helperSalaryAmount?: string | number | null;
};

type MaterialRateInput = string | number | null | undefined;

function finiteNumber(value: string | number | null | undefined) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

export function calculateLabourTotal(
  rowOrPeople: LabourTotalInput | number | null | undefined,
  wage?: string | number | null,
) {
  if (typeof rowOrPeople === "number" || rowOrPeople == null) {
    const people = Number(rowOrPeople ?? 0);
    const wageValue = finiteNumber(wage);
    return Number.isFinite(people) && Number.isFinite(wageValue) ? people * wageValue : 0;
  }

  const splitTotal =
    finiteNumber(rowOrPeople.masonSalaryAmount) +
    finiteNumber(rowOrPeople.helperSalaryAmount);
  if (splitTotal > 0) return splitTotal;

  const stored = finiteNumber(rowOrPeople.salaryAmount);
  if (stored > 0) return stored;

  const people = Number(rowOrPeople.peopleCount ?? 0);
  const wageValue = finiteNumber(rowOrPeople.wagePerHead);
  return Number.isFinite(people) && Number.isFinite(wageValue) ? people * wageValue : 0;
}

export function calculateMaterialUnitRate(cost: MaterialRateInput, quantity: MaterialRateInput) {
  const total = finiteNumber(cost);
  const qty = finiteNumber(quantity);
  if (!Number.isFinite(total) || !Number.isFinite(qty) || qty <= 0) return null;
  return total / qty;
}

export function calculateMachineryTotal(row: { totalCost?: string | number | null }) {
  return finiteNumber(row.totalCost);
}

export function consolidationKeyForEntry(type: EntryType, entry: Record<string, unknown>) {
  const date = String(type === "incident" ? entry.createdAt ?? "" : entry.date ?? "").slice(0, 10);
  if (type === "labour") return `${date}|${String(entry.workType ?? "")}`;
  if (type === "material") return `${date}|${String(entry.materialType ?? "")}|${String(entry.workStage ?? "")}`;
  if (type === "machinery") return `${date}|${String(entry.equipmentType ?? "")}`;
  if (type === "expense") return `${date}|${String(entry.category ?? "")}`;
  return `${date}|${String(entry.incidentType ?? "")}|${String(entry.severity ?? "")}`;
}

export function calculateSiteTrackedSpend(rows: {
  labour: LabourTotalInput[];
  material: Array<{ cost?: string | number | null }>;
  machinery: Array<{ totalCost?: string | number | null }>;
  expense: Array<{ amount?: string | number | null }>;
}) {
  return (
    rows.labour.reduce((sum, row) => sum + calculateLabourTotal(row), 0) +
    rows.material.reduce((sum, row) => sum + finiteNumber(row.cost), 0) +
    rows.machinery.reduce((sum, row) => sum + calculateMachineryTotal(row), 0) +
    rows.expense.reduce((sum, row) => sum + finiteNumber(row.amount), 0)
  );
}
