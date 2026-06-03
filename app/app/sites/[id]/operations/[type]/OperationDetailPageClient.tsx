"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Edit3,
  FileText,
  Layers,
  Repeat,
  Trash2,
  TrendingUp,
} from "lucide-react";

import { requestJson } from "@/lib/http/client";
import { confirmDialog } from "@/lib/ui/confirm";
import type { EntryType } from "@/lib/db/queries/entries";

type Site = {
  name: string;
  location: string;
};

type Entry = Record<string, any>;

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
};

const materialStages = [
  "Basement Level",
  "Brick Level",
  "Lintel Level",
  "Roof Level",
  "Compound Wall",
  "Other",
] as const;

const typeLabel: Record<EntryType, string> = {
  labour: "Labour",
  material: "Material",
  machinery: "Machinery",
  expense: "Expense",
  incident: "Incident",
};

const typeIcon: Record<EntryType, typeof FileText> = {
  labour: FileText,
  material: Layers,
  machinery: Repeat,
  expense: TrendingUp,
  incident: AlertCircle,
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  if (!value) return "Unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN");
}

function formatDateFieldValue(value: string) {
  if (!value) return "Select date";
  const date = parseDateValue(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
}

function parseDateValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return new Date(Number.NaN);
  return new Date(year, month - 1, day);
}

function toDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

function calendarDays(viewDate: Date) {
  const firstOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
}

function entryId(entry: Entry, type: EntryType) {
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

function entryDate(entry: Entry, type: EntryType) {
  if (type === "incident") {
    return String(entry.createdAt ?? "").slice(0, 10);
  }
  return String(entry.date ?? "");
}

function entrySpend(entry: Entry, type: EntryType) {
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

function entryCategoryKey(entry: Entry, type: EntryType) {
  if (type === "labour") return String(entry.workType ?? "Labour");
  if (type === "material") return `${entry.materialType ?? "Material"}|${entry.workStage ?? "Other"}`;
  if (type === "machinery") return String(entry.equipmentType ?? "Machinery");
  if (type === "expense") return String(entry.category ?? "Misc");
  return String(entry.incidentType ?? "Incident");
}

function renderEntrySummary(entry: Entry, type: EntryType) {
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
            {entry.peopleCount ?? 0} people x {formatCurrency(wage)}
          </p>
        )}
        <p className="text-sm font-bold text-sky-400">{formatCurrency(entrySpend(entry, type))}</p>
        {entry.remarks ? <p className="text-xs text-slate-500">{entry.remarks}</p> : null}
      </div>
    );
  }

  if (type === "material") {
    const rate = Number(entry.quantity ?? 0) > 0
      ? Number(entry.cost ?? 0) / Number(entry.quantity)
      : null;
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
          {rate != null ? ` at ${formatCurrency(rate)} each` : ""}
        </p>
        <p className="text-sm font-bold text-sky-400">{formatCurrency(Number(entry.cost ?? 0))}</p>
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

function DateFilterField({
  id,
  label,
  value,
  onChange,
  openId,
  setOpenId,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  openId: string | null;
  setOpenId: (value: string | null) => void;
}) {
  const selectedDate = value ? parseDateValue(value) : null;
  const open = openId === id;
  const setOpen = (next: boolean) => setOpenId(next ? id : null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewDate, setViewDate] = useState(
    selectedDate && !Number.isNaN(selectedDate.getTime()) ? selectedDate : new Date(),
  );

  useEffect(() => {
    if (!open) return;
    function handlePointer(event: MouseEvent | TouchEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpenId(null);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenId(null);
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("touchstart", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("touchstart", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, setOpenId]);
  const todayValue = toDateValue(new Date());
  const selectedValue = selectedDate && !Number.isNaN(selectedDate.getTime()) ? toDateValue(selectedDate) : "";

  function changeMonth(offset: number) {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  function selectDate(date: Date) {
    onChange(toDateValue(date));
    setViewDate(date);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className={open ? "relative z-[90] space-y-2" : "relative space-y-2"}>
      <label
        htmlFor={id}
        className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400"
      >
        {label}
      </label>
      <button
        id={id}
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-14 w-full cursor-pointer items-center justify-between rounded-2xl border border-white/8 bg-white/[0.04] px-5 text-left text-slate-100 transition-colors hover:border-sky-500/30 hover:bg-white/[0.06] focus:border-sky-500/70 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
      >
        <span className={value ? "text-base font-medium text-slate-100" : "text-base font-medium text-slate-500"}>
          {formatDateFieldValue(value)}
        </span>
        <CalendarDays className="w-5 h-5 text-slate-500" />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-3rem))] rounded-2xl border border-sky-500/20 bg-slate-950 p-4 shadow-2xl shadow-sky-950/40">
          <div className="flex items-center justify-between pb-3">
            <p className="text-sm font-extrabold uppercase tracking-widest text-white">
              {monthLabel(viewDate)}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => changeMonth(-1)}
                aria-label="Previous month"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition-colors hover:border-sky-500/30 hover:text-sky-400"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => changeMonth(1)}
                aria-label="Next month"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition-colors hover:border-sky-500/30 hover:text-sky-400"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 pb-2">
            {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
              <div
                key={`${day}-${index}`}
                className="flex h-8 items-center justify-center text-[10px] font-extrabold uppercase tracking-widest text-slate-500"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarDays(viewDate).map((date) => {
              const dateValue = toDateValue(date);
              const isSelected = dateValue === selectedValue;
              const isToday = dateValue === todayValue;
              const isCurrentMonth = date.getMonth() === viewDate.getMonth();

              return (
                <button
                  key={dateValue}
                  type="button"
                  onClick={() => selectDate(date)}
                  className={[
                    "flex h-10 items-center justify-center rounded-xl text-sm font-bold transition-colors",
                    isSelected
                      ? "bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/20"
                      : "text-slate-200 hover:bg-sky-500/10 hover:text-sky-400",
                    !isCurrentMonth && !isSelected ? "text-slate-700" : "",
                    isToday && !isSelected ? "border border-sky-500/40" : "",
                  ].join(" ")}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-widest text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => selectDate(new Date())}
              className="rounded-xl bg-sky-500 px-3 py-2 text-xs font-extrabold uppercase tracking-widest text-slate-950 transition-colors hover:bg-sky-400"
            >
              Today
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function OperationDetailPageClient({
  site,
  siteId,
  type,
  initialEntries,
  initialFilters,
  categoryOptions: initialCategoryOptions,
}: Props) {
  const router = useRouter();
  const [filters, setFilters] = useState(initialFilters);
  const [openDateField, setOpenDateField] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const Icon = typeIcon[type];
  const categoryOptions = Array.from(
    new Set(filters.category ? [filters.category, ...initialCategoryOptions] : initialCategoryOptions),
  );

  const totalSpend = initialEntries.reduce((sum, entry) => sum + entrySpend(entry, type), 0);
  const stageTotals = materialStages.map((stage) => ({
    stage,
    total: initialEntries
      .filter((entry) => entry.workStage === stage)
      .reduce((sum, entry) => sum + Number(entry.cost ?? 0), 0),
  }));
  const groupedEntries = new Map<string, Map<string, Entry[]>>();
  for (const entry of initialEntries) {
    const dateKey = entryDate(entry, type) || "Unknown";
    const categoryKey = entryCategoryKey(entry, type);
    const dateGroup = groupedEntries.get(dateKey) ?? new Map<string, Entry[]>();
    dateGroup.set(categoryKey, [...(dateGroup.get(categoryKey) ?? []), entry]);
    groupedEntries.set(dateKey, dateGroup);
  }
  const groupedRows = [...groupedEntries.entries()].map(([date, categoryGroups]) => ({
    date,
    rows: [...categoryGroups.values()].map((entries) => ({
      entries,
      primary: entries[0],
      total: entries.reduce((sum, entry) => sum + entrySpend(entry, type), 0),
      editable: entries.length === 1,
    })),
  })).sort((left, right) => {
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
      const key = `${group.date}|${categoryKey}`;
      const next = (runningByCategory.get(categoryKey) ?? 0) + row.total;
      runningByCategory.set(categoryKey, next);
      runningTotals.set(key, next);
    }
  }

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
    const res = await requestJson<null>(`/api/entries/${id}?type=${type}`, { method: "DELETE" });
    setDeletingId(null);

    if (!res.ok) {
      toast.error(res.message);
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
                <Icon className="w-5 h-5" />
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
            <p className="text-2xl font-extrabold text-white">{initialEntries.length}</p>
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
              const runningKey = `${date}|${entryCategoryKey(entry, type)}`;
              return (
                <div key={`${runningKey}|${id ?? "group"}`} className="card-standard p-4 flex items-start justify-between gap-4">
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

        {initialEntries.length === 0 ? (
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
