"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { formatCurrency } from "@/components/operations/entryFormat";
import type { StageSummaryRow } from "@/lib/catalog/stageSummaryView";
import type { StageCompositionRow, StageEntryType } from "@/lib/db/queries/stageSummary";

const TYPE_LABELS: Record<StageEntryType, string> = {
  material: "Material",
  labour: "Labour",
  machinery: "Machinery",
  expense: "Expense",
};

// Matches the operations palette so a stage's split reads the same as the
// per-type cards on the site detail page.
const TYPE_BARS: Record<StageEntryType, string> = {
  material: "bg-amber-500",
  labour: "bg-sky-500",
  machinery: "bg-violet-500",
  expense: "bg-emerald-500",
};

const TYPE_ORDER: StageEntryType[] = ["material", "labour", "machinery", "expense"];

function span(row: StageSummaryRow) {
  if (!row.firstDate) return "No dated entries";
  return row.firstDate === row.lastDate
    ? row.firstDate
    : `${row.firstDate} → ${row.lastDate}`;
}

export default function StageSummaryClient({
  siteId,
  siteName,
  budget,
  rows,
}: {
  siteId: string;
  siteName: string;
  budget: number | null;
  rows: StageSummaryRow[];
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, StageCompositionRow[]>>({});
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const tracked = rows.reduce((sum, r) => sum + r.total, 0);

  async function toggle(row: StageSummaryRow) {
    if (openKey === row.key) {
      setOpenKey(null);
      return;
    }
    setOpenKey(row.key);
    if (detail[row.key]) return; // already fetched; re-expanding must not refetch

    setLoadingKey(row.key);
    try {
      const res = await fetch(
        `/api/sites/${siteId}/stages/${encodeURIComponent(row.key)}`,
      );
      if (!res.ok) throw new Error(String(res.status));
      // API responses are enveloped: { success, data, meta }.
      const body = (await res.json()) as { data?: { rows?: StageCompositionRow[] } };
      setDetail((d) => ({ ...d, [row.key]: body.data?.rows ?? [] }));
    } catch {
      // Leave the key unset so a retry re-fetches rather than caching a failure.
      setDetail((d) => {
        const next = { ...d };
        delete next[row.key];
        return next;
      });
    } finally {
      setLoadingKey((k) => (k === row.key ? null : k));
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pt-2">
      <div className="px-1">
        <Link
          href={`/app/sites/${siteId}`}
          className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-sky-400 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          {siteName}
        </Link>
        <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-white uppercase">
          Work Stages
        </h2>
        <p className="text-sm text-slate-500 font-medium italic mt-1.5">
          {formatCurrency(tracked)} tracked
          {budget ? ` of ${formatCurrency(budget)} budget` : ""}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="card-standard p-6 text-sm text-slate-500 font-semibold">
          No entries logged for this site yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const open = openKey === row.key;
            return (
              <li
                key={row.key}
                className={`card-standard overflow-hidden ${
                  row.kind === "stage" ? "border-2 border-white/5" : "border-2 border-dashed border-white/10"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggle(row)}
                  aria-expanded={open}
                  className="w-full p-5 text-left focus:outline-none focus:ring-2 focus:ring-sky-500/70 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-extrabold uppercase tracking-widest ${
                          row.kind === "stage" ? "text-white" : "text-slate-400"
                        }`}
                      >
                        {row.label}
                      </p>
                      <p className="text-xs text-slate-500 font-semibold mt-1">
                        {/* Derived from entry dates — stages have no tracked start/end. */}
                        {span(row)} · {row.entryCount.toLocaleString("en-IN")}{" "}
                        {row.entryCount === 1 ? "entry" : "entries"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="text-lg font-extrabold text-sky-400">
                          {formatCurrency(row.total)}
                        </p>
                        {budget ? (
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            {((row.total / budget) * 100).toFixed(1)}% of budget
                          </p>
                        ) : null}
                      </div>
                      <ChevronRight
                        className={`w-5 h-5 text-slate-500 transition-transform ${open ? "rotate-90" : ""}`}
                      />
                    </div>
                  </div>

                  {row.total > 0 && (
                    <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                      {TYPE_ORDER.filter((t) => row.byType[t] > 0).map((t) => (
                        <div
                          key={t}
                          className={TYPE_BARS[t]}
                          style={{ width: `${(row.byType[t] / row.total) * 100}%` }}
                        />
                      ))}
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {TYPE_ORDER.filter((t) => row.byType[t] > 0).map((t) => (
                      <span key={t} className="text-[11px] font-semibold text-slate-500">
                        {TYPE_LABELS[t]} {formatCurrency(row.byType[t])}
                      </span>
                    ))}
                  </div>
                </button>

                {open && (
                  <div className="border-t border-white/5 bg-black/20 px-5 py-4">
                    {loadingKey === row.key && (
                      <p className="text-xs text-slate-500 font-semibold">Loading…</p>
                    )}
                    {loadingKey !== row.key && !detail[row.key] && (
                      <p className="text-xs text-slate-500 font-semibold">
                        Could not load the breakdown. Tap to retry.
                      </p>
                    )}
                    {detail[row.key]?.length === 0 && (
                      <p className="text-xs text-slate-500 font-semibold">
                        No material or labour entries in this stage.
                      </p>
                    )}
                    {detail[row.key]?.map((d) => (
                      <div
                        key={`${d.entryType}-${d.name}`}
                        className="flex items-baseline justify-between gap-4 py-1"
                      >
                        <span className="text-xs text-slate-300 font-semibold min-w-0 truncate">
                          {d.name}
                          <span className="text-slate-600 font-medium">
                            {d.quantity != null && d.unit ? ` · ${d.quantity} ${d.unit}` : ""}
                            {d.headCount ? ` · ${d.headCount} heads` : ""}
                          </span>
                        </span>
                        <span className="text-xs font-bold text-slate-300 shrink-0">
                          {formatCurrency(d.spend)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
