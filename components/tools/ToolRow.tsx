"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Clock, Hammer, Minus, Plus } from "lucide-react";

import { AssignmentPanel, type SiteOption } from "@/components/tools/AssignmentPanel";
import type { ToolDTO } from "@/lib/client/tools";
import { useToolMovements } from "@/lib/client/tools";
import type { AssignmentInput, InvalidReason, ToolResultStatus } from "@/lib/tools/types";

export type ToolDraft = { totalQuantity: number; assignments: AssignmentInput[] };

const REASON_COPY: Record<InvalidReason, string> = {
  sum_exceeds_total: "Assigned more than the total stock.",
  duplicate_site: "A site appears twice.",
  non_positive_qty: "Quantities must be at least 1.",
  non_integer: "Quantities must be whole numbers.",
  negative_total: "Total cannot be negative.",
  total_below_assigned: "Total is below what is deployed — return from sites first.",
  retire_exceeds_free: "Can only retire units that are free in the warehouse.",
  site_unavailable: "A selected site was archived or deleted — refresh and retry.",
  not_found: "This tool no longer exists.",
};

const KIND_LABEL: Record<string, string> = {
  opening: "Opening stock",
  procure: "Procured",
  retire: "Retired",
  assign: "Assigned",
  return: "Returned",
  transfer: "Transferred",
  adjust: "Adjusted",
};

function locationLabel(loc: string, siteName: (id: string) => string): string {
  if (loc === "WAREHOUSE") return "Warehouse";
  if (loc === "EXTERNAL") return "External";
  return siteName(loc);
}

export function ToolRow({
  tool,
  draft,
  sites,
  categoryName,
  dirty,
  save,
  onChange,
  onOpenLedger,
}: {
  tool: ToolDTO;
  draft: ToolDraft;
  sites: SiteOption[];
  categoryName: string;
  dirty: boolean;
  save: { status: ToolResultStatus; reason?: InvalidReason } | null;
  onChange: (next: ToolDraft) => void;
  onOpenLedger: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const assigned = draft.assignments.reduce((s, a) => s + a.qty, 0);
  const free = draft.totalQuantity - assigned;
  const overAssigned = free < 0;

  const { data: movementsResult, isLoading: isMovementsLoading } = useToolMovements(expanded ? tool.toolId : null);
  const movements = movementsResult?.ok ? movementsResult.data.movements : [];

  const siteName = useMemo(() => {
    const map = new Map(sites.map((s) => [s.siteId, s.name]));
    return (id: string) => map.get(id) ?? "Unknown site";
  }, [sites]);

  const borderTone =
    save?.status === "conflict"
      ? "border-amber-500/60"
      : save?.status === "invalid" || overAssigned
        ? "border-error/60"
        : expanded
          ? "border-white/10"
          : dirty
            ? "border-primary/40"
            : "border-white/5";

  return (
    <div className={`rounded-xl border bg-surface-container-lowest transition-colors ${borderTone}`}>
      {/* Header */}
      <div className="flex items-center gap-2.5 pl-3.5 pr-3.5 py-2.5">
        {/* Column 1: Expand Chevron */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse tool" : "Expand tool"}
          className="grid h-7 w-7 shrink-0 place-items-center text-on-surface-variant transition-colors hover:text-on-surface rounded hover:bg-white/5"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {/* Column 2: Main Tool Information Row-Split Container */}
        <div className="min-w-0 flex-1 flex flex-col space-y-1.5">
          {/* Row 1: Tool Name & Availability Badge */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="truncate text-sm font-semibold leading-tight text-white">{tool.name}</span>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" aria-label="Active" />
              {dirty ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="Unsaved changes" /> : null}
            </div>
            <span
              className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none ${
                free < 0 ? "bg-error/20 text-error" : "bg-emerald-500/15 text-emerald-400"
              }`}
            >
              {free} free
            </span>
          </div>

          {/* Row 2: Metadata (Type • Code • Total) & History Icon */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[11px] font-medium leading-none text-on-surface-variant whitespace-nowrap">
              <span>{categoryName}</span>
              <span aria-hidden className="text-white/20 select-none">•</span>
              <span>{tool.code}</span>
              <span aria-hidden className="text-white/20 select-none">•</span>
              <span className="tabular-nums">Total {draft.totalQuantity}</span>
            </div>
            <button
              type="button"
              onClick={onOpenLedger}
              aria-label="View history"
              className="grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded text-on-surface-variant transition-colors hover:bg-white/5 hover:text-blue-400"
            >
              <Clock className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {save && save.status !== "ok" ? (
        <p className={`px-4 pb-2 text-xs font-semibold ${save.status === "conflict" ? "text-amber-400" : "text-error"}`}>
          {save.status === "conflict"
            ? "Changed by someone else — values refreshed, review and save again."
            : (save.reason && REASON_COPY[save.reason]) || "Could not save this tool."}
        </p>
      ) : null}

      {/* Expanded body */}
      {expanded ? (
        <div className="space-y-3 border-t border-white/5 px-3.5 py-3">
          {/* Total stock */}
          <div className="rounded-lg border border-white/5 px-3.5 py-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">Total stock</p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Decrease total"
                  onClick={() => onChange({ ...draft, totalQuantity: Math.max(0, draft.totalQuantity - 1) })}
                  className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-outline bg-white/5 text-on-surface-variant transition-colors hover:bg-white/10"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <input
                  aria-label="Total stock"
                  type="number"
                  min={0}
                  value={draft.totalQuantity}
                  onChange={(e) => onChange({ ...draft, totalQuantity: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                  className="h-8 w-14 rounded-lg border border-outline bg-transparent px-2 text-center text-sm font-semibold tabular-nums text-white outline-none"
                />
                <button
                  type="button"
                  aria-label="Increase total"
                  onClick={() => onChange({ ...draft, totalQuantity: draft.totalQuantity + 1 })}
                  className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-outline bg-white/5 text-on-surface-variant transition-colors hover:bg-white/10"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          <AssignmentPanel
            total={draft.totalQuantity}
            assignments={draft.assignments}
            sites={sites}
            onChange={(assignments) => onChange({ ...draft, assignments })}
          />

          {/* Inline History Timeline */}
          <div className="rounded-lg border border-white/5 px-3.5 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant mb-2">Movement History</p>
            {isMovementsLoading ? (
              <p className="text-[11px] text-on-surface-variant">Loading movements...</p>
            ) : movements.length === 0 ? (
              <p className="text-[11px] text-on-surface-variant">No movements recorded yet.</p>
            ) : (
              <ol className="space-y-2 max-h-36 overflow-y-auto">
                {movements.slice(0, 5).map((m) => (
                  <li key={m.movementId} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-[11px] border-b border-white/5 pb-1.5 last:border-0 last:pb-0">
                    <div className="min-w-0">
                      <span className="font-semibold text-white mr-1.5">{KIND_LABEL[m.kind] ?? m.kind}</span>
                      <span className="text-on-surface-variant/80">
                        {locationLabel(m.fromLocation, siteName)} → {locationLabel(m.toLocation, siteName)}
                      </span>
                      {m.note && <span className="text-slate-500 text-[10px] ml-1.5">({m.note})</span>}
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                      <span className="font-mono text-slate-500 text-[10px]">{new Date(m.createdAt).toLocaleDateString()}</span>
                      <span className="font-semibold text-white">×{m.quantity}</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="flex justify-end pt-0.5">
            <button
              type="button"
              onClick={onOpenLedger}
              className="cursor-pointer text-[10px] font-medium text-on-surface-variant transition-colors hover:text-blue-400"
            >
              View full ledger →
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
