export type { EntryType } from "@/lib/types/entry";
import { clientDescriptorFor } from "@/lib/entryTypes/client";
import type { EntryType } from "@/lib/types/entry";

export type Entry = Record<string, any>;

// The 4 cost-bearing operation types shown in the combined "All Operations"
// view. Incident carries no spend and is excluded from this expense ledger.
export type SpendType = Exclude<EntryType, "incident">;

export const SPEND_TYPES: readonly SpendType[] = ["labour", "material", "machinery", "expense"];

export type CombinedRow = {
  type: SpendType;
  id: string;
  date: string;
  spend: number;
  entry: Entry;
};

// Flattens the per-type arrays returned by getEntriesBySite(..., "all", ...)
// into one chronological-ready list. Reuses entryId/entryDate/entrySpend so
// the combined view's numbers stay identical to the per-type pages.
export function buildCombinedRows(grouped: Record<SpendType, Entry[]>): CombinedRow[] {
  const rows: CombinedRow[] = [];
  for (const type of SPEND_TYPES) {
    for (const entry of grouped[type]) {
      rows.push({
        type,
        id: String(entryId(entry, type)),
        date: entryDate(entry, type),
        spend: entrySpend(entry, type),
        entry,
      });
    }
  }
  return rows;
}

// Spend types whose returned list hit the per-type cap — used to show the
// "narrow your date range" advisory notice (E7). A type with exactly `cap`
// rows in range is a known, acceptable false positive (advisory only).
export function computeCappedTypes(grouped: Record<SpendType, Entry[]>, cap: number): SpendType[] {
  return SPEND_TYPES.filter((type) => grouped[type].length === cap);
}

// E3: an inverted date range (from > to) would otherwise dead-end on an empty
// result (dateWhere builds gte(from) AND lte(to)). Swap so the user still
// sees data; the caller surfaces `swapped` as an "adjusted range" notice.
export function swapDateRangeIfInverted(from: string, to: string): { from: string; to: string; swapped: boolean } {
  if (from && to && from > to) {
    return { from: to, to: from, swapped: true };
  }
  return { from, to, swapped: false };
}

export const workStages = [
  "Basement Level",
  "Brick Level",
  "Lintel Level",
  "Roof Level",
  "Compound Wall",
  "Other",
] as const;

export const typeLabel: Record<EntryType, string> = {
  labour: clientDescriptorFor("labour").label,
  material: clientDescriptorFor("material").label,
  machinery: clientDescriptorFor("machinery").label,
  expense: clientDescriptorFor("expense").label,
  incident: clientDescriptorFor("incident").label,
};

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function entryId(entry: Entry, type: EntryType) {
  return entry[clientDescriptorFor(type).idField];
}

export function entryDate(entry: Entry, type: EntryType) {
  const d = clientDescriptorFor(type);
  const raw = String(entry[d.dateField] ?? "");
  // Incidents carry a full timestamp; the other four carry a plain YYYY-MM-DD
  // date column. Only the timestamp needs slicing.
  return d.dateField === "createdAt" ? raw.slice(0, 10) : raw;
}

export function entrySpend(entry: Entry, type: EntryType) {
  return clientDescriptorFor(type).spendOf(entry);
}

// Grid-grouping key for the category-first operation view. Material groups by
// materialType alone — work-stage is a filter inside the category detail page,
// not part of the grid identity.
export function gridCategoryKey(entry: Entry, type: EntryType): string {
  const d = clientDescriptorFor(type);
  return String(entry[d.categoryField] ?? d.categoryFallback);
}

export function renderEntrySummary(entry: Entry, type: EntryType) {
  const isMerged = Number(entry._mergedEntryCount ?? 0) > 1;
  if (type === "labour") {
    const wage = Number(entry.wagePerHead ?? 0);
    const hasSplitRoles = Number(entry.masonCount ?? 0) > 0 || Number(entry.helperCount ?? 0) > 0;
    return (
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-bold text-slate-100">{entry.workType ?? "Labour"}</p>
          {entry.workStage ? (
            <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-emerald-400">
              {entry.workStage}
            </span>
          ) : null}
        </div>
        {hasSplitRoles ? (
          <div className="space-y-0.5 text-xs text-slate-500">
            <p>Mason: {entry.masonCount ?? 0} people, {formatCurrency(Number(entry.masonSalaryAmount ?? 0))}</p>
            <p>Helper: {entry.helperCount ?? 0} people, {formatCurrency(Number(entry.helperSalaryAmount ?? 0))}</p>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            {entry.peopleCount ?? 0} people{isMerged ? "" : ` x ${formatCurrency(wage)}`}
          </p>
        )}
        <p className="text-sm font-bold text-sky-400">{formatCurrency(entrySpend(entry, type))}</p>
        {entry.remarks ? <p className="text-xs text-slate-500">{entry.remarks}</p> : null}
      </div>
    );
  }

  if (type === "material") {
    const hasCost = entry.cost != null && entry.cost !== "";
    return (
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-bold text-slate-100">{entry.materialType ?? "Material"}</p>
          <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-emerald-400">
            {entry.workStage ?? "Other"}
          </span>
        </div>
        <p className="text-xs text-slate-500">
          {entry.quantity ?? 0} {entry.unit ?? ""}
        </p>
        {hasCost ? (
          <p className="text-sm font-bold text-sky-400">{formatCurrency(Number(entry.cost))}</p>
        ) : null}
        {entry.remarks ? <p className="text-xs text-slate-500">{entry.remarks}</p> : null}
      </div>
    );
  }

  if (type === "machinery") {
    return (
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-bold text-slate-100">{entry.equipmentType ?? "Machinery"}</p>
          {entry.workStage ? (
            <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-emerald-400">
              {entry.workStage}
            </span>
          ) : null}
        </div>
        <p className="text-xs text-slate-500">{entry.count ?? 0} units</p>
        {entry.hoursActive ? <p className="text-xs text-slate-500">{entry.hoursActive} hours active</p> : null}
        {entry.totalCost ? <p className="text-sm font-bold text-sky-400">{formatCurrency(Number(entry.totalCost ?? 0))}</p> : null}
        {entry.remarks ? <p className="text-xs text-slate-500">{entry.remarks}</p> : null}
      </div>
    );
  }

  if (type === "expense") {
    return (
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-bold text-slate-100">{entry.description ?? "Expense"}</p>
          {entry.workStage ? (
            <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-emerald-400">
              {entry.workStage}
            </span>
          ) : null}
        </div>
        <p className="text-xs text-slate-500">{entry.category ?? "Misc"}</p>
        <p className="text-sm font-bold text-sky-400">{formatCurrency(Number(entry.amount ?? 0))}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="font-bold text-slate-100">{entry.incidentType ?? "Incident"}</p>
      <p className="text-xs text-slate-500">{entry.severity ?? "Low"}</p>
      <p className="text-xs text-slate-500">{entry.description ?? ""}</p>
    </div>
  );
}
