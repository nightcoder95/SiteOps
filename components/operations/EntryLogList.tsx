"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { notifyError } from "@/lib/ui/toast";
import { Edit3, Trash2 } from "lucide-react";

import { requestJson } from "@/lib/http/client";
import { confirmDialog } from "@/lib/ui/confirm";
import { formatDate as formatDateUtil } from "@/lib/utils/formatDate";
import type { EntryType } from "@/lib/db/queries/entries";
import {
  type Entry,
  entryId,
  formatCurrency,
  gridCategoryKey,
  renderEntrySummary,
} from "@/components/operations/entryFormat";
import { buildGroupedRows } from "@/components/operations/categoryView";

type EntryLogListProps = {
  siteId: string;
  type: EntryType;
  entries: Entry[];
  sort: string;
  highlightId?: string | null;
  onDeleted?: () => void;
};

function formatDate(value: string) {
  if (!value) return "Unknown";
  return formatDateUtil(value);
}

export default function EntryLogList({
  type,
  entries: entriesProp,
  sort,
  highlightId = null,
  onDeleted,
}: EntryLogListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Local working copy so delete can remove a row instantly (optimistic)
  // and roll back on error. Re-synced whenever the caller sends a fresh list.
  const [entries, setEntries] = useState(entriesProp);
  useEffect(() => {
    setEntries(entriesProp);
  }, [entriesProp]);

  // Deep-link highlight: when arriving with ?highlight=<entryId>, scroll the
  // matching log card into view and pulse it for ~2s, then strip the param
  // from the URL via history.replaceState (cosmetic only, no Next navigation).
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

  const { groupedRows, runningTotals } = useMemo(
    () => buildGroupedRows(entries, type, sort),
    [entries, type, sort],
  );

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
    onDeleted?.();
  }

  return (
    <section className="space-y-4">
      {groupedRows.map(({ date, rows }) => (
        <div key={date} className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">{formatDate(date)}</h2>
            {(type === "labour" || type === "material" || type === "machinery" || type === "expense") ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold uppercase tracking-widest text-slate-500">Day total</span>
                <span className="text-xs font-bold text-sky-400">
                  {formatCurrency(rows.reduce((sum, row) => sum + row.total, 0))}
                </span>
              </div>
            ) : null}
          </div>

          {rows.map((row) => {
            const entry = row.primary;
            const id = entryId(entry, type);
            const runningKey = id ? String(id) : `${date}|${gridCategoryKey(entry, type)}`;
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
                      <p className="text-xs font-extrabold uppercase tracking-widest text-slate-500">Running total</p>
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
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest italic">
            No matching logs found.
          </p>
        </div>
      ) : null}
    </section>
  );
}
