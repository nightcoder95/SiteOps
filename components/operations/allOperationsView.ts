import { SPEND_TYPES, type CombinedRow, type SpendType } from "./entryFormat";
import type { EntryType } from "@/lib/db/queries/entries";

export type AllOperationsSort = "newest" | "oldest" | "highest_spend" | "lowest_spend";

export type DayGroup = {
  date: string;
  rows: CombinedRow[];
  dayTotal: number;
};

export type OperationsView = {
  visibleRows: CombinedRow[];
  grandTotal: number;
  visibleLogCount: number;
  groupedRows: DayGroup[];
};

// Filter by enabled types, group by date, compute grand + day totals, and
// order day groups per the active sort. Type filtering is client-side (the
// full set is already loaded); date + sort drive the server query instead.
export function deriveOperationsView(
  rows: CombinedRow[],
  enabledTypes: Set<SpendType>,
  sort: AllOperationsSort,
): OperationsView {
  const visibleRows = rows.filter((row) => enabledTypes.has(row.type));
  const grandTotal = visibleRows.reduce((sum, row) => sum + row.spend, 0);

  const byDate = new Map<string, CombinedRow[]>();
  for (const row of visibleRows) {
    const key = row.date || "Unknown";
    byDate.set(key, [...(byDate.get(key) ?? []), row]);
  }

  const groupedRows: DayGroup[] = [...byDate.entries()].map(([date, dateRows]) => ({
    date,
    rows: dateRows,
    dayTotal: dateRows.reduce((sum, row) => sum + row.spend, 0),
  }));

  groupedRows.sort((left, right) => {
    if (sort === "highest_spend" || sort === "lowest_spend") {
      return sort === "highest_spend" ? right.dayTotal - left.dayTotal : left.dayTotal - right.dayTotal;
    }
    const leftTime = new Date(left.date).getTime();
    const rightTime = new Date(right.date).getTime();
    return sort === "oldest" ? leftTime - rightTime : rightTime - leftTime;
  });

  return {
    visibleRows,
    grandTotal,
    visibleLogCount: visibleRows.length,
    groupedRows,
  };
}

// E5: chips may all be deselected, but Apply is gated on at least one being
// enabled — the user is told to select one rather than silently applying an
// empty filter that yields nothing.
export function canApplyFilters(enabledTypes: Set<SpendType>): boolean {
  return enabledTypes.size > 0;
}

export function parseTypesParam(value: string | undefined): SpendType[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is SpendType => (SPEND_TYPES as readonly string[]).includes(item));
}

// Chip persistence (audit fix): Apply triggers router.push -> server re-render
// -> client remount, so a purely-local enabledTypes would silently reset to
// all-on. Encode chips in the URL as types=a,b and omit the param when all 4
// are enabled (the default), so the common case keeps a clean URL.
export function buildApplyFiltersUrl(
  siteId: string,
  filters: { from: string; to: string; sort: string },
  enabledTypes: Set<SpendType>,
): string {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.sort) params.set("sort", filters.sort);
  if (enabledTypes.size < SPEND_TYPES.length) {
    params.set("types", SPEND_TYPES.filter((type) => enabledTypes.has(type)).join(","));
  }
  const qs = params.toString();
  const base = `/app/sites/${siteId}/operations/all`;
  return qs ? `${base}?${qs}` : base;
}

type TypeSummary = { totalCount: number; totalSpend: number | null };

// Combined all-time total/count for the "All Operations" entry-point card:
// sums only the 4 spend types (incident carries no cost and is excluded),
// mirroring §5.4. No API call needed — initialSummary already has this data.
export function sumSpendTypeSummary(
  summary: Record<EntryType, TypeSummary>,
): { totalCount: number; totalSpend: number } {
  return SPEND_TYPES.reduce(
    (acc, type) => ({
      totalCount: acc.totalCount + summary[type].totalCount,
      totalSpend: acc.totalSpend + (summary[type].totalSpend ?? 0),
    }),
    { totalCount: 0, totalSpend: 0 },
  );
}
