import type { StageAggregateRow, StageEntryType } from "@/lib/db/queries/stageSummary";

export type StageRowKind = "stage" | "legacy" | "untagged";

export type StageSummaryRow = {
  key: string;
  label: string;
  kind: StageRowKind;
  entryCount: number;
  firstDate: string | null;
  lastDate: string | null;
  total: number;
  byType: Record<StageEntryType, number>;
};

const LEGACY_KEY = "__legacy__";
const UNTAGGED_KEY = "__untagged__";

// Two distinct causes, two rows. Entries predating migration 0025 could never
// have carried a stage; recent ones were skipped because the field was optional.
// Merging them reads as "your team is sloppy" when most of the money is in the
// half nobody could have tagged.
const LEGACY_LABEL = "Before Work Stage existed";
const UNTAGGED_LABEL = "Not tagged";

function emptyByType(): Record<StageEntryType, number> {
  return { labour: 0, material: 0, machinery: 0, expense: 0 };
}

function minDate(a: string | null, b: string | null) {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function maxDate(a: string | null, b: string | null) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

// Turns flat per-(stage, type) aggregates into display rows.
//
// Ordering follows the catalog array's index — the catalog query already sorts
// by sort_order then name, so index IS construction sequence. Stages present on
// entries but absent from the catalog (renamed or deactivated) are appended
// rather than dropped: their spend is real, and losing it would make the page
// disagree with the site total.
export function buildStageSummary(input: {
  aggregates: StageAggregateRow[];
  catalogOrder: string[];
}): StageSummaryRow[] {
  const byKey = new Map<string, StageSummaryRow>();

  for (const agg of input.aggregates) {
    const stage = agg.stage?.trim() ? agg.stage.trim() : null;
    const kind: StageRowKind = stage ? "stage" : agg.legacy ? "legacy" : "untagged";
    const key = stage ?? (agg.legacy ? LEGACY_KEY : UNTAGGED_KEY);

    let row = byKey.get(key);
    if (!row) {
      row = {
        key,
        label: stage ?? (agg.legacy ? LEGACY_LABEL : UNTAGGED_LABEL),
        kind,
        entryCount: 0,
        firstDate: null,
        lastDate: null,
        total: 0,
        byType: emptyByType(),
      };
      byKey.set(key, row);
    }

    row.entryCount += agg.entryCount;
    row.total += agg.spend;
    row.byType[agg.entryType] += agg.spend;
    row.firstDate = minDate(row.firstDate, agg.firstDate);
    row.lastDate = maxDate(row.lastDate, agg.lastDate);
  }

  const rank = new Map(input.catalogOrder.map((name, i) => [name, i]));
  const stages = [...byKey.values()].filter((r) => r.kind === "stage");
  stages.sort((a, b) => {
    // Orphans (absent from the catalog) sort after every known stage, then by name.
    const ra = rank.get(a.label) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b.label) ?? Number.MAX_SAFE_INTEGER;
    return ra - rb || a.label.localeCompare(b.label);
  });

  // Legacy before skipped: chronological, and it puts the unfixable gap first
  // so the actionable one reads as the smaller, current problem.
  const trailing = [byKey.get(LEGACY_KEY), byKey.get(UNTAGGED_KEY)].filter(
    (r): r is StageSummaryRow => Boolean(r),
  );

  return [...stages, ...trailing];
}
