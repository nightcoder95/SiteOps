"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Hammer, Minus, Plus } from "lucide-react";

import { AssignmentPanel, type SiteOption } from "@/components/tools/AssignmentPanel";
import type { ToolDTO } from "@/lib/client/tools";
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
    <div className={`rounded-2xl border bg-surface-container-lowest transition-colors ${borderTone}`}>
      {/* Header */}
      <div className="flex items-start gap-2.5 p-4">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse tool" : "Expand tool"}
          className="grid h-9 w-7 shrink-0 cursor-pointer place-items-center text-on-surface-variant transition-colors hover:text-on-surface"
        >
          {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </button>

        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-blue-600 text-white" aria-hidden>
          <Hammer className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-bold leading-snug text-white">{tool.name}</span>
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" aria-label="Active" />
            {dirty ? <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unsaved changes" /> : null}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-on-surface-variant">
            <span className="font-mono">{tool.code}</span>
            <span aria-hidden className="text-outline">•</span>
            <span>{categoryName}</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
          <div className="flex items-center gap-2 text-sm">
            <span className="whitespace-nowrap tabular-nums text-on-surface-variant">
              Total <span className="font-semibold text-on-surface">{draft.totalQuantity}</span>
            </span>
            <span
              className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                free < 0 ? "bg-error/20 text-error" : "bg-emerald-500/15 text-emerald-400"
              }`}
            >
              {free} free
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenLedger}
            className="cursor-pointer rounded-lg text-xs font-semibold text-blue-500 transition-colors hover:text-blue-400"
          >
            History
          </button>
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
        <div className="space-y-4 border-t border-white/5 p-4">
          {/* Total stock */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Total stock</p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <button
                type="button"
                aria-label="Decrease total"
                onClick={() => onChange({ ...draft, totalQuantity: Math.max(0, draft.totalQuantity - 1) })}
                className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-outline bg-white/5 text-on-surface-variant transition-colors hover:bg-white/10"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <input
                aria-label="Total stock"
                type="number"
                min={0}
                value={draft.totalQuantity}
                onChange={(e) => onChange({ ...draft, totalQuantity: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                className="h-9 w-14 rounded-lg border border-outline bg-transparent px-2 text-center text-sm font-semibold tabular-nums text-white outline-none"
              />
              <button
                type="button"
                aria-label="Increase total"
                onClick={() => onChange({ ...draft, totalQuantity: draft.totalQuantity + 1 })}
                className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-outline bg-white/5 text-on-surface-variant transition-colors hover:bg-white/10"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <AssignmentPanel
            total={draft.totalQuantity}
            assignments={draft.assignments}
            sites={sites}
            onChange={(assignments) => onChange({ ...draft, assignments })}
          />
        </div>
      ) : null}
    </div>
  );
}
