"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { notifyError } from "@/lib/ui/toast";
import { CheckCircle2, Circle, Clock3, Edit3, Trash2 } from "lucide-react";

import { EntryTypeIcon } from "@/components/constants/EntryTypeIcon";
import { requestJson } from "@/lib/http/client";
import { confirmDialog } from "@/lib/ui/confirm";
import { formatDate } from "@/lib/utils/formatDate";
import { DateFilterField } from "@/components/operations/DateFilterField";
import { getTypeColor, getTypeActiveGlowColor, getTypeDotColor } from "@/components/operations/typeStyles";
import {
  formatCurrency,
  renderEntrySummary,
  SPEND_TYPES,
  typeLabel,
  type CombinedRow,
  type SpendType,
} from "@/components/operations/entryFormat";
import {
  boundaryIdsFor,
  buildApplyFiltersUrl,
  canApplyFilters,
  canLoadMore,
  deriveOperationsView,
  mergeLoadedRows,
  type AllOperationsSort,
} from "@/components/operations/allOperationsView";
import { buildCombinedRows } from "@/components/operations/entryFormat";

// Matches the per-type limit the server page requests; a short page therefore
// means that type is exhausted.
const PAGE_SIZE = 200;

type Site = {
  name: string;
  location: string;
};

type Filters = {
  from: string;
  to: string;
  sort: AllOperationsSort;
  types: SpendType[];
  adjustedRange: boolean;
};

type Props = {
  site: Site;
  siteId: string;
  initialRows: CombinedRow[];
  initialFilters: Filters;
  capped: SpendType[];
  highlightId?: string | null;
};

export default function AllOperationsPageClient({
  site,
  siteId,
  initialRows,
  initialFilters,
  capped,
  highlightId = null,
}: Props) {
  const router = useRouter();
  const [filters, setFilters] = useState({
    from: initialFilters.from,
    to: initialFilters.to,
    sort: initialFilters.sort,
  });
  const [enabledTypes, setEnabledTypes] = useState<Set<SpendType>>(
    () => new Set(initialFilters.types.length > 0 ? initialFilters.types : SPEND_TYPES),
  );
  const [openDateField, setOpenDateField] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Local working copy of the SSR rows so delete can remove a row instantly
  // (optimistic) and roll back on error, and so "Load more" can append. Re-synced
  // whenever the server sends a fresh list (filter navigation).
  const [rows, setRows] = useState(initialRows);
  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  // `capped` starts as the server's per-type cap report and shrinks as pages are
  // loaded: a type that returns a short page has nothing left, so its banner
  // (and its share of "Load more") goes away.
  const [cappedTypes, setCappedTypes] = useState<SpendType[]>(capped);
  useEffect(() => {
    setCappedTypes(capped);
  }, [capped]);
  const [loadingMore, setLoadingMore] = useState(false);

  // Deep-link highlight: when arriving from global search with ?highlight=<id>
  // (read server-side, passed as a prop), scroll the matching log card into
  // view and pulse it for ~2s, then strip the param via history.replaceState.
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (!highlightId) return;
    setPulse(true);
    const scrollT = window.setTimeout(() => {
      document
        .querySelector("[data-highlight-target]")
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 150);
    const offT = window.setTimeout(() => setPulse(false), 2400);
    const params = new URLSearchParams(window.location.search);
    params.delete("highlight");
    params.delete("date");
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
    );
    return () => {
      window.clearTimeout(scrollT);
      window.clearTimeout(offT);
    };
  }, [highlightId]);

  const { grandTotal, visibleLogCount, groupedRows } = useMemo(
    () => deriveOperationsView(rows, enabledTypes, filters.sort),
    [rows, enabledTypes, filters.sort],
  );

  const allSelected = enabledTypes.size === SPEND_TYPES.length;

  function toggleAllTypes() {
    if (allSelected) {
      setEnabledTypes(new Set([SPEND_TYPES[0]]));
    } else {
      setEnabledTypes(new Set(SPEND_TYPES));
    }
  }

  function toggleType(type: SpendType) {
    setEnabledTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  const applyEnabled = canApplyFilters(enabledTypes);

  function applyFilters() {
    if (!applyEnabled) return;
    router.push(buildApplyFiltersUrl(siteId, filters, enabledTypes));
  }

  function clearFilters() {
    setFilters({ from: "", to: "", sort: "newest" });
    setEnabledTypes(new Set(SPEND_TYPES));
    router.push(`/app/sites/${siteId}/operations/all`);
  }

  async function handleDelete(row: CombinedRow) {
    const confirmed = await confirmDialog({
      title: "Delete log entry?",
      message: "This action cannot be undone.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (!confirmed) return;

    setDeletingId(row.id);
    const prevRows = rows;
    setRows((current) => current.filter((item) => item.id !== row.id));
    const res = await requestJson<null>(`/api/entries/${row.id}?type=${row.type}`, { method: "DELETE" });
    setDeletingId(null);

    if (!res.ok) {
      setRows(prevRows);
      notifyError(res);
      return;
    }

    toast.success("Entry deleted");
    // No router.refresh(): grandTotal / visibleLogCount / groupedRows are all
    // derived client-side from `rows`, which the optimistic update above has
    // already corrected. Refreshing re-ran the full five-table SSR fetch for
    // nothing. `capped` (the 200-row banner) is server-derived and may be one
    // row stale until the next navigation — accepted; it is advisory only.
  }

  // Keyset "load more": one request per still-capped type, continuing from the
  // last row already loaded for it. The server re-applies the site scope and the
  // same filters, so this only ever extends the current view.
  async function handleLoadMore() {
    const boundaries = boundaryIdsFor(rows, cappedTypes);
    const types = Object.keys(boundaries) as SpendType[];
    if (types.length === 0) return;

    setLoadingMore(true);
    const params = (type: SpendType) => {
      const qs = new URLSearchParams({ type, sort: filters.sort, limit: String(PAGE_SIZE) });
      qs.set("after", String(boundaries[type]));
      if (filters.from) qs.set("from", filters.from);
      if (filters.to) qs.set("to", filters.to);
      return qs.toString();
    };

    const results = await Promise.all(
      types.map(async (type) => ({
        type,
        res: await requestJson<Record<string, unknown>[]>(`/api/sites/${siteId}/entries?${params(type)}`),
      })),
    );
    setLoadingMore(false);

    const failed = results.find((result) => !result.res.ok);
    if (failed && !failed.res.ok) {
      notifyError(failed.res);
      return;
    }

    const grouped = { labour: [], material: [], machinery: [], expense: [] } as Record<
      SpendType,
      Record<string, unknown>[]
    >;
    const exhausted: SpendType[] = [];
    for (const { type, res } of results) {
      const page = res.ok ? (res.data ?? []) : [];
      grouped[type] = page;
      if (page.length < PAGE_SIZE) exhausted.push(type);
    }

    setRows((current) => mergeLoadedRows(current, buildCombinedRows(grouped)));
    setCappedTypes((current) => current.filter((type) => !exhausted.includes(type)));
  }

  return (
    <div className="space-y-6 pt-2 pb-20 max-w-5xl mx-auto">
      <section className="card-standard p-5 border-sky-500/10 bg-sky-500/5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3 min-w-0">
            <Link
              href={`/app/sites/${siteId}`}
              className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-sky-400 hover:text-sky-300"
            >
              <Clock3 className="w-3.5 h-3.5" />
              Back to site
            </Link>
            <div>
              <h1 className="text-2xl font-extrabold uppercase tracking-tight text-white">
                All Operations
              </h1>
              <p className="text-xs text-slate-500 font-semibold">{site.name}</p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-2xl font-extrabold text-white">{visibleLogCount}</p>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Logs</p>
            <p className="mt-2 text-sm font-bold text-sky-400">{formatCurrency(grandTotal)}</p>
          </div>
        </div>
      </section>

      {initialFilters.adjustedRange ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs font-semibold text-amber-400">
          Adjusted date range (From was after To).
        </div>
      ) : null}

      {cappedTypes.length > 0 ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs font-semibold text-amber-400">
          {canLoadMore(filters.sort, cappedTypes) ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                Showing the most recent {PAGE_SIZE}{" "}
                {cappedTypes.map((type) => typeLabel[type]).join(", ")} entries.
              </span>
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="btn-secondary min-h-11 px-4 text-xs disabled:opacity-60"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : (
            // Spend sorts order the page in JS after the limit, so paging past
            // the cap would produce a list that is only sorted within a page.
            <span>
              Showing the most recent {PAGE_SIZE}{" "}
              {cappedTypes.map((type) => typeLabel[type]).join(", ")} entries — narrow the date range,
              or sort by date to load more.
            </span>
          )}
        </div>
      ) : null}

      <section className="card-standard overflow-visible p-4 grid gap-4 md:grid-cols-3">
        <DateFilterField
          id="filter-from"
          label="From Date"
          value={filters.from}
          onChange={(value) => setFilters((state) => ({ ...state, from: value }))}
          openId={openDateField}
          setOpenId={setOpenDateField}
        />
        <DateFilterField
          id="filter-to"
          label="To Date"
          value={filters.to}
          onChange={(value) => setFilters((state) => ({ ...state, to: value }))}
          openId={openDateField}
          setOpenId={setOpenDateField}
        />
        <div className="space-y-2">
          <label
            htmlFor="filter-sort"
            className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400"
          >
            Sort By
          </label>
          <select
            id="filter-sort"
            value={filters.sort}
            onChange={(event) =>
              setFilters((state) => ({ ...state, sort: event.target.value as AllOperationsSort }))
            }
            className="input-standard appearance-none bg-slate-900"
            aria-label="Sort"
          >
            <option value="newest" className="bg-slate-900">Newest first</option>
            <option value="oldest" className="bg-slate-900">Oldest first</option>
            <option value="highest_spend" className="bg-slate-900">Highest spend</option>
            <option value="lowest_spend" className="bg-slate-900">Lowest spend</option>
          </select>
        </div>

        <div className="flex items-center justify-between gap-2 md:col-span-3">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
            Operation Types
          </span>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-md px-2.5 py-0.5 text-[10px] font-semibold transition-all ${
                allSelected
                  ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                  : "bg-slate-800 text-slate-400 border border-slate-700"
              }`}
            >
              {allSelected ? "All Selected" : `${enabledTypes.size} of ${SPEND_TYPES.length} Selected`}
            </span>
            <button
              type="button"
              onClick={toggleAllTypes}
              className="text-[10px] font-bold text-sky-400 hover:text-sky-300 underline cursor-pointer"
            >
              {allSelected ? "Deselect All" : "Select All"}
            </button>
          </div>
        </div>

        <div
          className="flex flex-wrap items-center gap-2 md:col-span-3"
          role="group"
          aria-label="Filter by operation type"
        >
          {SPEND_TYPES.map((type) => {
            const active = enabledTypes.has(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => toggleType(type)}
                aria-pressed={active}
                className={`inline-flex h-11 items-center justify-between gap-2.5 rounded-xl px-3.5 text-[11px] font-bold uppercase tracking-widest transition-all cursor-pointer ${
                  active
                    ? getTypeActiveGlowColor(type)
                    : "border border-white/10 bg-slate-900/60 text-slate-400 hover:border-white/20 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2">
                  <EntryTypeIcon type={type} className="w-4 h-4 shrink-0" />
                  <span>{typeLabel[type]}</span>
                </div>
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full transition-all ${
                    active ? getTypeDotColor(type) : "bg-slate-700"
                  }`}
                />
              </button>
            );
          })}
        </div>

        {!applyEnabled ? (
          <p
            className="md:col-span-3 -mb-1 text-[11px] font-bold uppercase tracking-widest text-amber-400"
            role="alert"
          >
            Select at least one operation type to apply.
          </p>
        ) : null}
        <div className="grid gap-3 md:col-span-3 md:grid-cols-[1fr_auto]">
          <button
            type="button"
            onClick={applyFilters}
            disabled={!applyEnabled}
            aria-disabled={!applyEnabled}
            className="btn-primary h-12 py-3 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Apply Filters
          </button>
          <button type="button" onClick={clearFilters} className="btn-secondary h-12 py-3">
            Clear Filters
          </button>
        </div>
      </section>

      <section className="space-y-4">
        {groupedRows.map(({ date, rows: dayRows, dayTotal }) => (
          <div key={date} className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">{formatDate(date)}</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold uppercase tracking-widest text-slate-500">Day total</span>
                <span className="text-xs font-bold text-sky-400">{formatCurrency(dayTotal)}</span>
              </div>
            </div>

            {dayRows.map((row) => {
              const rowHighlighted = highlightId ? row.id === highlightId : false;
              return (
                <div
                  key={`${row.type}-${row.id}`}
                  data-entry-id={row.id}
                  data-highlight-target={rowHighlighted ? "" : undefined}
                  className={`card-standard p-4 flex items-start justify-between gap-4 transition-shadow ${
                    rowHighlighted && pulse ? "ring-2 ring-sky-400 ring-offset-2 ring-offset-[#020617]" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-bold uppercase tracking-widest ${getTypeColor(row.type)}`}
                    >
                      <EntryTypeIcon type={row.type} className="w-3 h-3" />
                      {typeLabel[row.type]}
                    </span>
                    {renderEntrySummary(row.entry, row.type)}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/app/logs/${row.id}?type=${row.type}`}
                      aria-label="Edit entry"
                      className="w-10 h-10 rounded-xl border border-white/10 bg-white/5 text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 flex items-center justify-center transition-colors"
                    >
                      <Edit3 className="w-4 h-4" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => void handleDelete(row)}
                      disabled={deletingId === row.id}
                      aria-label="Delete entry"
                      className="w-10 h-10 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center justify-center transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {visibleLogCount === 0 ? (
          <div className="text-center py-20 bg-white/2 rounded-3xl border border-dashed border-white/5">
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest italic">
              No matching logs found.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
