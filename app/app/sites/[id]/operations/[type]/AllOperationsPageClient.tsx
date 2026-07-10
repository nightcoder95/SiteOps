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
import { getTypeColor, getTypeSolidColor } from "@/components/operations/typeStyles";
import {
  formatCurrency,
  renderEntrySummary,
  SPEND_TYPES,
  typeLabel,
  type CombinedRow,
  type SpendType,
} from "@/components/operations/entryFormat";
import {
  buildApplyFiltersUrl,
  canApplyFilters,
  deriveOperationsView,
  type AllOperationsSort,
} from "@/components/operations/allOperationsView";

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
  // (optimistic) and roll back on error. Re-synced whenever the server sends
  // a fresh list (filter navigation / router.refresh()).
  const [rows, setRows] = useState(initialRows);
  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

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
    router.refresh();
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
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Logs</p>
            <p className="mt-2 text-sm font-bold text-sky-400">{formatCurrency(grandTotal)}</p>
          </div>
        </div>
      </section>

      {initialFilters.adjustedRange ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs font-semibold text-amber-400">
          Adjusted date range (From was after To).
        </div>
      ) : null}

      {capped.length > 0 ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs font-semibold text-amber-400">
          Showing the most recent 200 {capped.map((type) => typeLabel[type]).join(", ")} entries — narrow the date
          range to see more.
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
                className={`inline-flex h-11 items-center gap-2 rounded-xl border px-3.5 text-[11px] font-bold uppercase tracking-widest transition-colors ${
                  active
                    ? `${getTypeSolidColor(type)} shadow-sm`
                    : "border-white/10 bg-white/[0.03] text-slate-500 hover:border-white/20 hover:text-slate-300"
                }`}
              >
                {active ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" strokeWidth={2.5} />
                ) : (
                  <Circle className="w-4 h-4 shrink-0 text-slate-600" strokeWidth={2} />
                )}
                <EntryTypeIcon type={type} className="w-4 h-4 shrink-0" />
                {typeLabel[type]}
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
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Day total</span>
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
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${getTypeColor(row.type)}`}
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
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest italic">
              No matching logs found.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
