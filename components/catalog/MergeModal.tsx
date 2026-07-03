"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Combine, TriangleAlert } from "lucide-react";

import { ModalShell } from "@/components/ui/motion";

export type MergeCandidate = { id: string; name: string; usageCount: number };

type Props = {
  open: boolean;
  sourceName: string;
  /** Rows the source can merge into (same list, self excluded). */
  candidates: MergeCandidate[];
  onClose: () => void;
  /** Return true on success (modal closes). */
  onMerge: (targetId: string) => Promise<boolean>;
};

// Explicit merge dialog. The old flow set a hidden "merge mode" and required a
// second overflow-menu tap on the target row — it looked like nothing happened.
// Here the source is fixed, the target is picked from a visible list, and one
// confirm runs the merge.
export function MergeModal({ open, sourceName, candidates, onClose, onMerge }: Props) {
  const [targetId, setTargetId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    if (open) {
      setTargetId(null);
      setMerging(false);
    }
  }, [open]);

  const target = candidates.find((c) => c.id === targetId) ?? null;

  async function handleMerge() {
    if (!target || merging) return;
    setMerging(true);
    const ok = await onMerge(target.id);
    setMerging(false);
    if (ok) onClose();
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      className="flex max-h-[85vh] w-full max-w-md flex-col rounded-3xl border border-white/10 bg-[#0b1220] p-5 shadow-2xl"
    >
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/20">
          <Combine className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-lg font-extrabold text-white">Merge item</h3>
          <p className="flex items-center gap-1.5 truncate text-xs text-slate-500">
            <span className="truncate font-semibold text-slate-300">{sourceName}</span>
            <ArrowRight className="h-3 w-3 shrink-0" />
            <span className="truncate">{target ? target.name : "select a target"}</span>
          </p>
        </div>
      </div>

      {candidates.length === 0 ? (
        <p className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-500">
          No other items to merge into.
        </p>
      ) : (
        <div className="-mx-1 min-h-0 flex-1 space-y-1.5 overflow-y-auto px-1">
          {candidates.map((c) => {
            const active = c.id === targetId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setTargetId(c.id)}
                className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                  active
                    ? "border-violet-500/50 bg-violet-500/10"
                    : "border-white/10 bg-white/[0.03] hover:bg-white/5"
                }`}
              >
                <span className={`truncate text-sm font-semibold ${active ? "text-white" : "text-slate-200"}`}>
                  {c.name}
                </span>
                <span className="shrink-0 text-[11px] text-slate-500">Usage {c.usageCount}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <p className="text-xs text-amber-200/90">
          Entries logged against "{sourceName}" will be rewritten to the target, and the source will be deactivated.
        </p>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold uppercase tracking-widest text-slate-300 transition-colors hover:bg-white/10"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!target || merging}
          onClick={() => void handleMerge()}
          className="flex-1 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-bold uppercase tracking-widest text-white transition-colors hover:bg-violet-400 disabled:opacity-40"
        >
          {merging ? "Merging…" : "Merge"}
        </button>
      </div>
    </ModalShell>
  );
}
