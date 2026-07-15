"use client";

import Link from "next/link";

import { EntryTypeIcon } from "@/components/constants/EntryTypeIcon";
import { formatDate } from "@/lib/utils/formatDate";
import { buildCategorySummaries } from "@/components/operations/categoryView";
import { type Entry, formatCurrency, type EntryType } from "@/components/operations/entryFormat";

type CategoryGridProps = {
  entries: Entry[];
  type: EntryType;
  siteId: string;
};

export default function CategoryGrid({ entries, type, siteId }: CategoryGridProps) {
  const summaries = buildCategorySummaries(entries, type);

  if (summaries.length === 0) {
    return (
      <div className="text-center py-20 bg-white/2 rounded-3xl border border-dashed border-white/5">
        <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest italic">
          No logs found.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {summaries.map((summary) => (
        <Link
          key={summary.key}
          href={`/app/sites/${siteId}/operations/${type}/${encodeURIComponent(summary.key)}`}
          className="card-standard p-4 space-y-3 hover:border-sky-500/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-sky-400 shrink-0">
              <EntryTypeIcon type={type} className="w-6 h-6" />
            </div>
            <p className="font-bold text-slate-100 truncate">{summary.key}</p>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">{summary.count} entries</p>
            <p className="text-sm font-bold text-sky-400">{formatCurrency(summary.totalSpend)}</p>
          </div>
          {summary.lastActivity ? (
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {formatDate(summary.lastActivity)}
            </p>
          ) : null}
        </Link>
      ))}
    </div>
  );
}
