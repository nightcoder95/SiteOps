"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Clock3 } from "lucide-react";

import { EntryTypeIcon } from "@/components/constants/EntryTypeIcon";
import { DateFilterField } from "@/components/operations/DateFilterField";
import EntryLogList from "@/components/operations/EntryLogList";
import CategoryGrid from "@/components/operations/CategoryGrid";
import { buildGroupedRows } from "@/components/operations/categoryView";
import type { EntryType } from "@/lib/db/queries/entries";
import {
  type Entry,
  formatCurrency,
  materialStages,
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
  initialView?: "category" | "all";
};

const SPEND_TYPES_WITH_GRID = ["labour", "material", "machinery", "expense"] as const;

export default function OperationDetailPageClient({
  site,
  siteId,
  type,
  initialEntries,
  initialFilters,
  categoryOptions: initialCategoryOptions,
  highlightId = null,
  initialView = "category",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState(initialFilters);
  const [openDateField, setOpenDateField] = useState<string | null>(null);
  const [entries, setEntries] = useState(initialEntries);
  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  const isGridEligible = (SPEND_TYPES_WITH_GRID as readonly string[]).includes(type);
  const [view, setView] = useState<"category" | "all">(initialView);

  function selectView(next: "category" | "all") {
    setView(next);
    const params = new URLSearchParams(window.location.search);
    if (next === "all") {
      params.set("view", "all");
    } else {
      params.delete("view");
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  const categoryOptions = Array.from(
    new Set(filters.category ? [filters.category, ...initialCategoryOptions] : initialCategoryOptions),
  );

  // Header numbers only — the grouped-card rendering itself lives in EntryLogList.
  const { totalSpend, visibleLogCount } = useMemo(
    () => buildGroupedRows(entries, type, filters.sort),
    [entries, type, filters.sort],
  );

  const stageTotals = useMemo(
    () =>
      materialStages.map((stage) => ({
        stage,
        total: entries
          .filter((entry) => entry.workStage === stage)
          .reduce((sum, entry) => sum + Number(entry.cost ?? 0), 0),
      })),
    [entries],
  );

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

      {isGridEligible ? (
        <div className="inline-flex rounded-2xl border border-white/10 bg-white/5 p-1">
          <button
            type="button"
            onClick={() => selectView("category")}
            className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors ${
              view === "category" ? "bg-sky-500 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            By Category
          </button>
          <button
            type="button"
            onClick={() => selectView("all")}
            className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors ${
              view === "all" ? "bg-sky-500 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            All Logs
          </button>
        </div>
      ) : null}

      {isGridEligible && view === "category" ? (
        <CategoryGrid entries={entries} type={type} siteId={siteId} />
      ) : (
        <>
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

      <EntryLogList
        siteId={siteId}
        type={type}
        entries={entries}
        sort={filters.sort}
        highlightId={highlightId}
        onDeleted={() => router.refresh()}
      />
        </>
      )}
    </div>
  );
}
