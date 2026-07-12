"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { notifyError } from "@/lib/ui/toast";
import { Clock3, Edit3, Trash2 } from "lucide-react";

import { EntryTypeIcon } from "@/components/constants/EntryTypeIcon";
import { requestJson } from "@/lib/http/client";
import { confirmDialog } from "@/lib/ui/confirm";
import { formatDate as formatDateUtil } from "@/lib/utils/formatDate";
import type { EntryType } from "@/lib/db/queries/entries";
import { DateFilterField } from "@/components/operations/DateFilterField";
import {
  type Entry,
  entryCategoryKey,
  entryDate,
  entryId,
  entrySpend,
  formatCurrency,
  materialStages,
  mergeVisualEntries,
  renderEntrySummary,
  typeLabel,
} from "@/components/operations/entryFormat";

type Site = {
  name: string;
  location: string;
};

type Filters = {
  from: string;
  to: string;
  category: string;
  workStage: string;
  sort: string;
};

type Props = {
  site: Site;
  siteId: string;
  type: EntryType;
  initialEntries: Entry[];
  initialFilters: Filters;
  categoryOptions: string[];
  highlightId?: string | null;
};

function formatDate(value: string) {
  if (!value) return "Unknown";
  return formatDateUtil(value);
}

export default function OperationDetailPageClient({
  site,
  siteId,
  type,
  initialEntries,
  initialFilters,
  categoryOptions: initialCategoryOptions,
  highlightId = null,
}: Props) {
  const router = useRouter();
  const [filters, setFilters] = useState(initialFilters);
  const [openDateField, setOpenDateField] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Local working copy of the SSR entries so delete can remove a row instantly
  // (optimistic) and roll back on error. Re-synced whenever the server sends a
  // fresh list (filter navigation / router.refresh()).
  const [entries, setEntries] = useState(initialEntries);
  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  // Deep-link highlight: when arriving from global search with ?highlight=<entryId>
  // (read server-side, passed as a prop), scroll the matching log card into view
  // and pulse it for ~2s, then strip the param from the URL via history.replaceState
  // (cosmetic only — no Next navigation, so a refresh won't re-pulse).
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

  const categoryOptions = Array.from(
    new Set(filters.category ? [filters.category, ...initialCategoryOptions] : initialCategoryOptions),
  );

  // Grouping, sorting and running totals are O(n) over every entry and only
  // depend on the data + sort. Memoize so unrelated state (open date picker,
  // pending delete) doesn't re-run the whole pipeline each render.
  const { totalSpend, stageTotals, groupedRows, runningTotals, visibleLogCount } = useMemo(() => {
    const totalSpend = entries.reduce((sum, entry) => sum + entrySpend(entry, type), 0);
    const stageTotals = materialStages.map((stage) => ({
      stage,
      total: entries
        .filter((entry) => entry.workStage === stage)
        .reduce((sum, entry) => sum + Number(entry.cost ?? 0), 0),
    }));
    let groupedRows;
    if (type === "material") {
      // Material entries: each transaction is its own independent card.
      const byDate = new Map<string, Entry[]>();
      for (const entry of entries) {
        const dateKey = entryDate(entry, type) || "Unknown";
        byDate.set(dateKey, [...(byDate.get(dateKey) ?? []), entry]);
      }
      groupedRows = [...byDate.entries()].map(([date, dateEntries]) => {
        // Sort entries within the day chronologically by createdAt ascending
        const sortedEntries = [...dateEntries].sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return aTime - bTime;
        });
        return {
          date,
          rows: sortedEntries.map((entry) => ({
            entries: [entry],
            primary: entry,
            total: entrySpend(entry, type),
            editable: true,
          })),
        };
      });
    } else {
      // Other types: existing category-based grouping.
      const groupedEntries = new Map<string, Map<string, Entry[]>>();
      for (const entry of entries) {
        const dateKey = entryDate(entry, type) || "Unknown";
        const categoryKey = entryCategoryKey(entry, type);
        const dateGroup = groupedEntries.get(dateKey) ?? new Map<string, Entry[]>();
        dateGroup.set(categoryKey, [...(dateGroup.get(categoryKey) ?? []), entry]);
        groupedEntries.set(dateKey, dateGroup);
      }
      groupedRows = [...groupedEntries.entries()].map(([date, categoryGroups]) => ({
        date,
        rows: [...categoryGroups.values()].map((groupEntries) => ({
          entries: groupEntries,
          primary: mergeVisualEntries(groupEntries, type),
          total: groupEntries.reduce((sum, entry) => sum + entrySpend(entry, type), 0),
          editable: groupEntries.length === 1,
        })),
      }));
    }
    groupedRows.sort((left, right) => {
      if (filters.sort === "highest_spend" || filters.sort === "lowest_spend") {
        const leftTotal = left.rows.reduce((sum, row) => sum + row.total, 0);
        const rightTotal = right.rows.reduce((sum, row) => sum + row.total, 0);
        return filters.sort === "highest_spend" ? rightTotal - leftTotal : leftTotal - rightTotal;
      }
      const leftTime = new Date(left.date).getTime();
      const rightTime = new Date(right.date).getTime();
      return filters.sort === "oldest" ? leftTime - rightTime : rightTime - leftTime;
    });

    const chronologicalGroups = [...groupedRows].sort(
      (left, right) => new Date(left.date).getTime() - new Date(right.date).getTime(),
    );
    const runningTotals = new Map<string, number>();
    const runningByCategory = new Map<string, number>();
    for (const group of chronologicalGroups) {
      for (const row of group.rows) {
        const categoryKey = entryCategoryKey(row.primary, type);
        const id = entryId(row.primary, type);
        // For material entries each row is an independent transaction;
        // use the unique entry ID as the running-total lookup key so
        // same-category transactions on the same day don't overwrite
        // each other's running total values.
        const key = (type === "material" && id) ? String(id) : `${group.date}|${categoryKey}`;
        const next = (runningByCategory.get(categoryKey) ?? 0) + row.total;
        runningByCategory.set(categoryKey, next);
        runningTotals.set(key, next);
      }
    }
    const visibleLogCount = groupedRows.reduce((sum, group) => sum + group.rows.length, 0);
    return { totalSpend, stageTotals, groupedRows, runningTotals, visibleLogCount };
  }, [entries, type, filters.sort]);

  function applyFilters() {
    const params = new URLSearchParams();
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.category) params.set("category", filters.category);
    if (filters.workStage) params.set("workStage", filters.workStage);
    if (filters.sort) params.set("sort", filters.sort);
    const query = params.toString();
    router.push(query ? `/app/sites/${siteId}/operations/${type}?${query}` : `/app/sites/${siteId}/operations/${type}`);
  }

  function clearFilters() {
    setFilters({ from: "", to: "", category: "", workStage: "", sort: "newest" });
    router.push(`/app/sites/${siteId}/operations/${type}`);
  }

  async function handleDelete(entry: Entry) {
    const id = entryId(entry, type);
    if (!id) return;
    const confirmed = await confirmDialog({
      title: "Delete log entry?",
      message: "This action cannot be undone.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (!confirmed) return;

    setDeletingId(id);
    // Optimistic: drop the row now, restore it if the server rejects.
    const prevEntries = entries;
    setEntries((current) => current.filter((item) => entryId(item, type) !== id));
    const res = await requestJson<null>(`/api/entries/${id}?type=${type}`, { method: "DELETE" });
    setDeletingId(null);

    if (!res.ok) {
      setEntries(prevEntries);
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
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-sky-400">
                <EntryTypeIcon type={type} className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold uppercase tracking-tight text-white">
                  {typeLabel[type]} Logs
                </h1>
                <p className="text-xs text-slate-500 font-semibold">{site.name}</p>
              </div>
            </div>
          </div>

          <div className="text-right">
            <p className="text-2xl font-extrabold text-white">{visibleLogCount}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Logs</p>
            {(type === "labour" || type === "material" || type === "machinery" || type === "expense") ? (
              <p className="mt-2 text-sm font-bold text-sky-400">{formatCurrency(totalSpend)}</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="card-standard overflow-visible p-4 grid gap-4 md:grid-cols-5">
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
            htmlFor="filter-category"
            className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400"
          >
            Category
          </label>
          <select
            id="filter-category"
            value={filters.category}
            onChange={(event) => setFilters((state) => ({ ...state, category: event.target.value }))}
            className="input-standard appearance-none bg-slate-900"
            aria-label="Category"
          >
            <option value="" className="bg-slate-900">All categories</option>
            {categoryOptions.map((option) => (
              <option key={option} value={option} className="bg-slate-900">
                {option}
              </option>
            ))}
          </select>
        </div>
        {type === "material" ? (
          <div className="space-y-2">
            <label
              htmlFor="filter-stage"
              className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400"
            >
              Work Stage
            </label>
            <select
              id="filter-stage"
              value={filters.workStage}
              onChange={(event) => setFilters((state) => ({ ...state, workStage: event.target.value }))}
              className="input-standard appearance-none bg-slate-900"
              aria-label="Work stage"
            >
              <option value="" className="bg-slate-900">All stages</option>
              {materialStages.map((stage) => (
                <option key={stage} value={stage} className="bg-slate-900">{stage}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="space-y-2">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
              Site
            </span>
            <div className="input-standard flex items-center text-xs uppercase tracking-widest text-slate-500">
              {site.location}
            </div>
          </div>
        )}
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
            onChange={(event) => setFilters((state) => ({ ...state, sort: event.target.value }))}
            className="input-standard appearance-none bg-slate-900"
            aria-label="Sort"
          >
            <option value="newest" className="bg-slate-900">Newest first</option>
            <option value="oldest" className="bg-slate-900">Oldest first</option>
            {(type === "labour" || type === "material" || type === "machinery" || type === "expense") ? (
              <>
                <option value="highest_spend" className="bg-slate-900">Highest spend</option>
                <option value="lowest_spend" className="bg-slate-900">Lowest spend</option>
              </>
            ) : null}
          </select>
        </div>
        <div className="grid gap-3 md:col-span-5 md:grid-cols-[1fr_auto]">
          <button type="button" onClick={applyFilters} className="btn-primary h-12 py-3">
            Apply Filters
          </button>
          <button type="button" onClick={clearFilters} className="btn-secondary h-12 py-3">
            Clear Filters
          </button>
        </div>
      </section>

      {type === "material" ? (
        <section className="grid gap-3 md:grid-cols-3">
          {stageTotals.map((item) => (
            <div key={item.stage} className="card-standard p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{item.stage}</p>
              <p className="mt-1 text-lg font-extrabold text-white">{formatCurrency(item.total)}</p>
            </div>
          ))}
        </section>
      ) : null}

      <section className="space-y-4">
        {groupedRows.map(({ date, rows }) => (
          <div key={date} className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">{formatDate(date)}</h2>
              {(type === "labour" || type === "material" || type === "machinery" || type === "expense") ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Day total</span>
                  <span className="text-xs font-bold text-sky-400">
                    {formatCurrency(rows.reduce((sum, row) => sum + row.total, 0))}
                  </span>
                </div>
              ) : null}
            </div>

            {rows.map((row) => {
              const entry = row.primary;
              const id = entryId(entry, type);
              const runningKey = (type === "material" && id) ? String(id) : `${date}|${entryCategoryKey(entry, type)}`;
              const rowHighlighted = highlightId
                ? row.entries.some((e) => String(entryId(e, type)) === highlightId)
                : false;
              return (
                <div
                  key={`${runningKey}|${id ?? "group"}`}
                  data-entry-id={id ?? undefined}
                  data-highlight-target={rowHighlighted ? "" : undefined}
                  className={`card-standard p-4 flex items-start justify-between gap-4 transition-shadow ${
                    rowHighlighted && pulse
                      ? "ring-2 ring-sky-400 ring-offset-2 ring-offset-[#020617]"
                      : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    {renderEntrySummary(entry, type)}
                    {(type === "labour" || type === "material" || type === "machinery" || type === "expense") ? (
                      <div className="mt-3 rounded-xl border border-sky-500/10 bg-sky-500/5 px-3 py-2">
                        <p className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500">Running total</p>
                        <p className="text-sm font-extrabold text-sky-400">
                          {formatCurrency(runningTotals.get(runningKey) ?? row.total)}
                        </p>
                      </div>
                    ) : null}
                  </div>
                  {row.editable && id ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href={`/app/logs/${id}?type=${type}`}
                        aria-label="Edit entry"
                        className="w-10 h-10 rounded-xl border border-white/10 bg-white/5 text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 flex items-center justify-center transition-colors"
                      >
                        <Edit3 className="w-4 h-4" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => void handleDelete(entry)}
                        disabled={deletingId === id}
                        aria-label="Delete entry"
                        className="w-10 h-10 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center justify-center transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}

        {entries.length === 0 ? (
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
