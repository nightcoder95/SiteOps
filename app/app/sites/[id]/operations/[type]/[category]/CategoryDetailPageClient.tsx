"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";

import { EntryTypeIcon } from "@/components/constants/EntryTypeIcon";
import { DateFilterField } from "@/components/operations/DateFilterField";
import EntryLogList from "@/components/operations/EntryLogList";
import { buildGroupedRows, entryMatchesSearch } from "@/components/operations/categoryView";
import type { EntryType } from "@/lib/db/queries/entries";
import {
  type Entry,
  formatCurrency,
  workStages,
} from "@/components/operations/entryFormat";

type Site = {
  name: string;
  location: string;
};

type Filters = {
  from: string;
  to: string;
  workStage: string;
  sort: string;
};

type Props = {
  site: Site;
  siteId: string;
  type: EntryType;
  category: string;
  initialEntries: Entry[];
  initialFilters: Filters;
  highlightId?: string | null;
};

export default function CategoryDetailPageClient({
  site: _site,
  siteId,
  type,
  category,
  initialEntries,
  initialFilters,
  highlightId = null,
}: Props) {
  const router = useRouter();
  const [filters, setFilters] = useState(initialFilters);
  const [openDateField, setOpenDateField] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), 200);
    return () => window.clearTimeout(t);
  }, [search]);

  const shown = useMemo(
    () => initialEntries.filter((entry) => entryMatchesSearch(entry, type, debouncedSearch)),
    [initialEntries, type, debouncedSearch],
  );

  const { totalSpend, visibleLogCount } = useMemo(
    () => buildGroupedRows(shown, type, filters.sort),
    [shown, type, filters.sort],
  );

  const basePath = `/app/sites/${siteId}/operations/${type}/${encodeURIComponent(category)}`;

  function applyFilters() {
    const params = new URLSearchParams();
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.workStage) params.set("workStage", filters.workStage);
    if (filters.sort) params.set("sort", filters.sort);
    const query = params.toString();
    router.push(query ? `${basePath}?${query}` : basePath);
  }

  function clearFilters() {
    setFilters({ from: "", to: "", workStage: "", sort: "newest" });
    router.push(basePath);
  }

  return (
    <div className="space-y-6 pt-2 pb-20 max-w-5xl mx-auto">
      <section className="card-standard p-5 border-sky-500/10 bg-sky-500/5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3 min-w-0">
            <Link
              href={`/app/sites/${siteId}/operations/${type}`}
              className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-sky-400 hover:text-sky-300"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to {type}
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-sky-400">
                <EntryTypeIcon type={type} className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold uppercase tracking-tight text-white">{category}</h1>
              </div>
            </div>
          </div>

          <div className="text-right">
            <p className="text-2xl font-extrabold text-white">{visibleLogCount}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Entries</p>
            <p className="mt-2 text-sm font-bold text-sky-400">{formatCurrency(totalSpend)}</p>
          </div>
        </div>
      </section>

      <section className="card-standard overflow-visible p-4 grid gap-4 md:grid-cols-5">
        <div className="md:col-span-5 space-y-2">
          <label
            htmlFor="filter-search"
            className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400"
          >
            Search
          </label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              id="filter-search"
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search remarks / amount"
              className="input-standard pl-9"
            />
          </div>
        </div>
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
        {(type === "labour" || type === "material" || type === "machinery" || type === "expense") ? (
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
              {workStages.map((stage) => (
                <option key={stage} value={stage} className="bg-slate-900">{stage}</option>
              ))}
            </select>
          </div>
        ) : null}
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
            <option value="highest_spend" className="bg-slate-900">Highest spend</option>
            <option value="lowest_spend" className="bg-slate-900">Lowest spend</option>
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

      <EntryLogList
        siteId={siteId}
        type={type}
        entries={shown}
        sort={filters.sort}
        highlightId={highlightId}
        onDeleted={() => router.refresh()}
      />
    </div>
  );
}
