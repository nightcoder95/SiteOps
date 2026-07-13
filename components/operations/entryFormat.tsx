import type { EntryType } from "@/lib/db/queries/entries";

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

export const materialStages = [
  "Basement Level",
  "Brick Level",
  "Lintel Level",
  "Roof Level",
  "Compound Wall",
  "Other",
] as const;

export const typeLabel: Record<EntryType, string> = {
  labour: "Labour",
  material: "Material",
  machinery: "Machinery",
  expense: "Expense",
  incident: "Incident",
};

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function entryId(entry: Entry, type: EntryType) {
  switch (type) {
    case "labour":
      return entry.labourEntryId;
    case "material":
      return entry.materialEntryId;
    case "machinery":
      return entry.machineryEntryId;
    case "expense":
      return entry.expenseEntryId;
    case "incident":
      return entry.incidentReportId;
  }
}

export function entryDate(entry: Entry, type: EntryType) {
  if (type === "incident") {
    return String(entry.createdAt ?? "").slice(0, 10);
  }
  return String(entry.date ?? "");
}

export function entrySpend(entry: Entry, type: EntryType) {
  if (type === "labour") {
    const splitTotal = Number(entry.masonSalaryAmount ?? 0) + Number(entry.helperSalaryAmount ?? 0);
    if (splitTotal > 0) return splitTotal;
    const stored = Number(entry.salaryAmount ?? 0);
    if (stored > 0) return stored;
    return Number(entry.peopleCount ?? 0) * Number(entry.wagePerHead ?? 0);
  }
  if (type === "material") {
    return Number(entry.cost ?? 0);
  }
  if (type === "machinery") {
    return Number(entry.totalCost ?? 0);
  }
  if (type === "expense") {
    return Number(entry.amount ?? 0);
  }
  return 0;
}

export function sumField(entries: Entry[], field: string) {
  return entries.reduce((sum, entry) => sum + Number(entry[field] ?? 0), 0);
}

export function mergeVisualEntries(entries: Entry[], type: EntryType) {
  const first = entries[0] ?? {};
  if (entries.length <= 1) return first;

  const total = entries.reduce((sum, entry) => sum + entrySpend(entry, type), 0);
  const merged = { ...first, _mergedEntryCount: entries.length };

  if (type === "labour") {
    return {
      ...merged,
      peopleCount: sumField(entries, "peopleCount"),
      wagePerHead: null,
      salaryAmount: total,
      masonCount: sumField(entries, "masonCount"),
      masonSalaryAmount: sumField(entries, "masonSalaryAmount"),
      helperCount: sumField(entries, "helperCount"),
      helperSalaryAmount: sumField(entries, "helperSalaryAmount"),
    };
  }

  if (type === "material") {
    return {
      ...merged,
      quantity: sumField(entries, "quantity"),
      cost: total,
    };
  }

  if (type === "machinery") {
    return {
      ...merged,
      count: sumField(entries, "count"),
      hoursActive: sumField(entries, "hoursActive"),
      totalCost: total,
    };
  }

  if (type === "expense") {
    return {
      ...merged,
      amount: total,
    };
  }

  return merged;
}

export function entryCategoryKey(entry: Entry, type: EntryType) {
  if (type === "labour") return String(entry.workType ?? "Labour");
  if (type === "material") return `${entry.materialType ?? "Material"}|${entry.workStage ?? "Other"}`;
  if (type === "machinery") return String(entry.equipmentType ?? "Machinery");
  if (type === "expense") return String(entry.category ?? "Misc");
  return String(entry.incidentType ?? "Incident");
}

export function renderEntrySummary(entry: Entry, type: EntryType) {
  const isMerged = Number(entry._mergedEntryCount ?? 0) > 1;
  if (type === "labour") {
    const wage = Number(entry.wagePerHead ?? 0);
    const hasSplitRoles = Number(entry.masonCount ?? 0) > 0 || Number(entry.helperCount ?? 0) > 0;
    return (
      <div className="space-y-1">
        <p className="font-bold text-slate-100">{entry.workType ?? "Labour"}</p>
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
          <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-emerald-400">
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
        <p className="font-bold text-slate-100">{entry.equipmentType ?? "Machinery"}</p>
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
        <p className="font-bold text-slate-100">{entry.description ?? "Expense"}</p>
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
