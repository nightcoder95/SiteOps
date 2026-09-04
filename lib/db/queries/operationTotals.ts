import { labourSpend, type LabourSpendInput } from "@/lib/services/labourSpend";
import type { EntryType } from "@/lib/types/entry";

// Default page size when caller does not specify. Keeps initial site-detail
// payload small enough to avoid 1MB+ RSC responses while still showing a
// useful first screen of activity.
export const DEFAULT_ENTRIES_LIMIT = 50;

// The grouped "all" view only renders a few rows per type by default, so
// fetching the full page for each of the 5 tables is wasted work and payload.
// The combined "All Operations" SSR page opts out via `fullAll: true`.
export const ALL_TYPE_PREVIEW_LIMIT = 5;

export function clampLimit(value: number | undefined) {
  if (!value || Number.isNaN(value)) return DEFAULT_ENTRIES_LIMIT;
  return Math.min(Math.max(1, Math.floor(value)), 200);
}

// type="all" defaults to a 5-per-type preview cap (dashboard/preview callers).
// Passing fullAll:true lifts it to the standard clampLimit ceiling (<=200 per
// type) for the combined date-range view. Single types always use clampLimit
// and ignore fullAll.
export function computeEntriesLimit(
  type: EntryType | "all",
  limit: number | undefined,
  fullAll: boolean | undefined,
) {
  if (type !== "all") return clampLimit(limit);
  return fullAll ? clampLimit(limit) : Math.min(clampLimit(limit), ALL_TYPE_PREVIEW_LIMIT);
}

type MaterialRateInput = string | number | null | undefined;

function finiteNumber(value: string | number | null | undefined) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

// Single implementation, owned by lib/services/labourSpend.ts so non-DB callers
// have an import path that does not reach into lib/db/queries (audit F10/F13).
export const calculateLabourTotal = labourSpend;

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
  labour: LabourSpendInput[];
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
