"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertCircle,
  Clock3,
  Edit3,
  FileText,
  Layers,
  Repeat,
  Trash2,
  TrendingUp,
} from "lucide-react";

import { requestJson } from "@/lib/http/client";
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
    return Number(entry.peopleCount ?? 0) * Number(entry.wagePerHead ?? 0);
  }
  if (type === "material") {
    return Number(entry.cost ?? 0);
  }
  if (type === "expense") {
    return Number(entry.amount ?? 0);
  }
  return 0;
}

function renderEntrySummary(entry: Entry, type: EntryType) {
  if (type === "labour") {
    const wage = Number(entry.wagePerHead ?? 0);
    return (
      <div className="space-y-1">
        <p className="font-bold text-slate-100">{entry.workType ?? "Labour"}</p>
        <p className="text-xs text-slate-500">
          {entry.peopleCount ?? 0} people x {formatCurrency(wage)}
        </p>
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

export default function OperationDetailPageClient({
  site,
  siteId,
  type,
  initialEntries,
  initialFilters,
}: Props) {
  const router = useRouter();
  const [filters, setFilters] = useState(initialFilters);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const Icon = typeIcon[type];

  const totalSpend = initialEntries.reduce((sum, entry) => sum + entrySpend(entry, type), 0);
  const stageTotals = materialStages.map((stage) => ({
    stage,
    total: initialEntries
      .filter((entry) => entry.workStage === stage)
      .reduce((sum, entry) => sum + Number(entry.cost ?? 0), 0),
  }));
  const groupedEntries = new Map<string, Entry[]>();
  for (const entry of initialEntries) {
    const key = entryDate(entry, type) || "Unknown";
    groupedEntries.set(key, [...(groupedEntries.get(key) ?? []), entry]);
  }
  const groupedRows = [...groupedEntries.entries()].sort(([leftDate, leftRows], [rightDate, rightRows]) => {
    if (filters.sort === "highest_spend" || filters.sort === "lowest_spend") {
      const leftTotal = leftRows.reduce((sum, entry) => sum + entrySpend(entry, type), 0);
      const rightTotal = rightRows.reduce((sum, entry) => sum + entrySpend(entry, type), 0);
      return filters.sort === "highest_spend" ? rightTotal - leftTotal : leftTotal - rightTotal;
    }
    const leftTime = new Date(leftDate).getTime();
    const rightTime = new Date(rightDate).getTime();
    return filters.sort === "oldest" ? leftTime - rightTime : rightTime - leftTime;
  });

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

  async function handleDelete(entry: Entry) {
    const id = entryId(entry, type);
    if (!id) return;
    const confirmed = window.confirm("Delete this log entry?");
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
            {(type === "labour" || type === "material" || type === "expense") ? (
              <p className="mt-2 text-sm font-bold text-sky-400">{formatCurrency(totalSpend)}</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="card-standard p-4 grid gap-3 md:grid-cols-5">
        <input
          type="date"
          value={filters.from}
          onChange={(event) => setFilters((state) => ({ ...state, from: event.target.value }))}
          className="input-standard"
          aria-label="From date"
        />
        <input
          type="date"
          value={filters.to}
          onChange={(event) => setFilters((state) => ({ ...state, to: event.target.value }))}
          className="input-standard"
          aria-label="To date"
        />
        <input
          type="text"
          value={filters.category}
          onChange={(event) => setFilters((state) => ({ ...state, category: event.target.value }))}
          className="input-standard"
          placeholder="Category"
          aria-label="Category"
        />
        {type === "material" ? (
          <select
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
        ) : (
          <div className="input-standard flex items-center text-xs uppercase tracking-widest text-slate-500">
            {site.location}
          </div>
        )}
        <select
          value={filters.sort}
          onChange={(event) => setFilters((state) => ({ ...state, sort: event.target.value }))}
          className="input-standard appearance-none bg-slate-900"
          aria-label="Sort"
        >
          <option value="newest" className="bg-slate-900">Newest first</option>
          <option value="oldest" className="bg-slate-900">Oldest first</option>
          {(type === "labour" || type === "material" || type === "expense") ? (
            <>
              <option value="highest_spend" className="bg-slate-900">Highest spend</option>
              <option value="lowest_spend" className="bg-slate-900">Lowest spend</option>
            </>
          ) : null}
        </select>
        <button type="button" onClick={applyFilters} className="btn-primary md:col-span-5 py-3">
          Apply Filters
        </button>
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
        {groupedRows.map(([date, rows]) => (
          <div key={date} className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">{formatDate(date)}</h2>
              {(type === "labour" || type === "material" || type === "expense") ? (
                <span className="text-xs font-bold text-sky-400">
                  {formatCurrency(rows.reduce((sum, entry) => sum + entrySpend(entry, type), 0))}
                </span>
              ) : null}
            </div>

            {rows.map((entry) => {
              const id = entryId(entry, type);
              return (
                <div key={id} className="card-standard p-4 flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    {renderEntrySummary(entry, type)}
                  </div>
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
