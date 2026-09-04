"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Minus, Package, Plus } from "lucide-react";

import type { AssignmentInput } from "@/lib/tools/types";

export type SiteOption = { siteId: string; name: string };

// Multi-site distribution editor for one tool. Steppers per assigned site + an
// "add another site" row. Enforces the invariant client-side (Σ ≤ total) so
// over-assign is blocked before the server round-trip; the server re-checks.
export function AssignmentPanel({
  total,
  assignments,
  sites,
  onChange,
}: {
  total: number;
  assignments: AssignmentInput[];
  sites: SiteOption[];
  onChange: (next: AssignmentInput[]) => void;
}) {
  const [addSiteId, setAddSiteId] = useState("");
  const [addQty, setAddQty] = useState(1);

  const assigned = assignments.reduce((s, a) => s + a.qty, 0);
  const free = total - assigned;
  const nameOf = useMemo(() => {
    const map = new Map(sites.map((s) => [s.siteId, s.name]));
    return (id: string) => map.get(id) ?? "Unknown site";
  }, [sites]);

  const usedIds = new Set(assignments.map((a) => a.siteId));
  const available = sites.filter((s) => !usedIds.has(s.siteId));

  function setQty(siteId: string, qty: number) {
    if (qty <= 0) {
      onChange(assignments.filter((a) => a.siteId !== siteId));
      return;
    }
    onChange(assignments.map((a) => (a.siteId === siteId ? { ...a, qty } : a)));
  }

  // Cap the "to assign" qty at whatever is free right now.
  const maxAddQty = Math.max(1, free);
  const clampedAddQty = Math.min(Math.max(1, addQty), maxAddQty);

  function addRow() {
    const qty = Math.min(Math.max(1, addQty), free);
    if (!addSiteId || qty < 1) return;
    onChange([...assignments, { siteId: addSiteId, qty }]);
    setAddSiteId("");
    setAddQty(1);
  }

  return (
    <div className="rounded-lg border border-white/5 px-3.5 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">Assigned to sites</p>

      <div className="mt-2.5 space-y-3">
        <div className="flex items-center gap-2 text-xs text-on-surface-variant">
          <Package className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span>
            {assignments.length} site{assignments.length === 1 ? "" : "s"} · {free} free
          </span>
        </div>

        {assignments.length > 0 && (
          <ul className="space-y-2">
            {assignments.map((a) => (
              <li key={a.siteId} className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 break-words text-xs font-medium text-white">{nameOf(a.siteId)}</span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={`Decrease ${nameOf(a.siteId)}`}
                    onClick={() => setQty(a.siteId, a.qty - 1)}
                    className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-outline bg-white/5 text-on-surface-variant transition-colors hover:bg-white/10"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <input
                    aria-label={`Quantity for ${nameOf(a.siteId)}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={a.qty}
                    onChange={(e) => setQty(a.siteId, Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                    className="h-8 w-14 rounded-lg border border-outline bg-transparent px-2 text-center text-sm font-semibold tabular-nums text-white outline-none"
                  />
                  <button
                    type="button"
                    aria-label={`Increase ${nameOf(a.siteId)}`}
                    disabled={free < 1}
                    onClick={() => setQty(a.siteId, a.qty + 1)}
                    className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-outline bg-white/5 text-on-surface-variant transition-colors hover:bg-white/10 disabled:opacity-30"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Add site select dropdown */}
        <div className="relative">
          <select
            aria-label="Add a site"
            value={addSiteId}
            onChange={(e) => {
              setAddSiteId(e.target.value);
              setAddQty(1);
            }}
            disabled={available.length === 0 || free < 1}
            className="h-9 w-full appearance-none cursor-pointer rounded-xl border border-outline bg-white/5 pl-3 pr-10 text-xs text-on-surface outline-none transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/40 disabled:opacity-40"
          >
            <option value="" className="bg-[#0f172a] text-on-surface">{free < 1 ? "No free units to assign" : "Add another site…"}</option>
            {available.map((s) => (
              <option key={s.siteId} value={s.siteId} className="bg-[#0f172a] text-on-surface">
                {s.name}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
            <ChevronDown className="h-4 w-4" />
          </div>
        </div>

        {/* Units to assign controls */}
        {addSiteId ? (
          <div className="space-y-2 pt-1">
            <span className="text-[11px] text-on-surface-variant">Units to assign</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Decrease units to assign"
                disabled={clampedAddQty <= 1}
                onClick={() => setAddQty((q) => Math.max(1, q - 1))}
                className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-outline bg-white/5 text-on-surface-variant transition-colors hover:bg-white/10 disabled:opacity-30"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <input
                aria-label="Units to assign"
                type="number"
                inputMode="numeric"
                min={1}
                max={maxAddQty}
                value={clampedAddQty}
                onChange={(e) => setAddQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                className="h-8 w-12 shrink-0 rounded-lg border border-outline bg-transparent px-1 text-center text-sm font-semibold tabular-nums text-white outline-none"
              />
              <button
                type="button"
                aria-label="Increase units to assign"
                disabled={clampedAddQty >= maxAddQty}
                onClick={() => setAddQty((q) => Math.min(maxAddQty, q + 1))}
                className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-outline bg-white/5 text-on-surface-variant transition-colors hover:bg-white/10 disabled:opacity-30"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <span className="text-[11px] tabular-nums text-on-surface-variant whitespace-nowrap">of {free} free</span>
              <button
                type="button"
                disabled={!addSiteId || free < 1}
                onClick={addRow}
                className="ml-auto h-8 shrink-0 cursor-pointer rounded-xl bg-blue-600 px-3.5 text-xs font-bold text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>
        ) : null}

        <p className={`text-[11px] font-semibold ${free < 0 ? "text-error" : "text-emerald-400"}`}>
          {free < 0 ? `Over-assigned by ${-free}` : `${free} free of ${total}`}
        </p>
      </div>
    </div>
  );
}
