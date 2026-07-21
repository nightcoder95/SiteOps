"use client";

import { AnimatePresence, motion } from "motion/react";
import { Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useToolMovements, useToolMutations } from "@/lib/client/tools";
import { notifyError } from "@/lib/ui/toast";

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

// Per-tool ledger timeline in a right-side drawer.
export function ToolLedgerDrawer({
  toolId,
  toolName,
  onClose,
  siteName,
}: {
  toolId: string | null;
  toolName: string;
  onClose: () => void;
  siteName: (id: string) => string;
}) {
  const { data: result, isLoading } = useToolMovements(toolId);
  const { clearMovements } = useToolMutations();
  const movements = result?.ok ? result.data.movements : [];

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Reset confirm modal when drawer closes or tool changes.
  useEffect(() => {
    setConfirmOpen(false);
    setClearing(false);
  }, [toolId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (confirmOpen) {
          setConfirmOpen(false);
        } else {
          onClose();
        }
      }
    }
    if (toolId) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toolId, onClose, confirmOpen]);

  async function handleClear() {
    if (!toolId) return;
    setClearing(true);
    const res = await clearMovements(toolId);
    setClearing(false);
    if (!res.ok) {
      notifyError(res);
      return;
    }
    toast.success(`Cleared ${res.data.deleted} movement${res.data.deleted === 1 ? "" : "s"}.`);
    setConfirmOpen(false);
  }

  return (
    <AnimatePresence>
      {toolId ? (
        <motion.div
          className="fixed inset-0 z-[60] flex justify-end bg-black/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.aside
            role="dialog"
            aria-label={`Movement history for ${toolName}`}
            className="flex h-full w-full max-w-md flex-col border-l border-outline-variant bg-surface-container"
            initial={{ x: 40 }}
            animate={{ x: 0 }}
            exit={{ x: 40 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-outline-variant/60 px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
                  Movement history
                </p>
                <h2 className="mt-0.5 break-words text-base font-bold leading-tight text-white">{toolName}</h2>
              </div>
              <button
                type="button"
                aria-label="Close history"
                onClick={onClose}
                className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full border border-outline-variant text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Movement list */}
            <div className="flex-1 overflow-y-auto px-4 py-3.5">
              {isLoading ? (
                <p className="text-xs text-on-surface-variant">Loading…</p>
              ) : movements.length === 0 ? (
                <p className="text-xs text-on-surface-variant">No movements yet.</p>
              ) : (
                <ol className="space-y-1.5">
                  {movements.map((m) => (
                    <li key={m.movementId} className="rounded-lg border border-outline-variant/40 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white">{KIND_LABEL[m.kind] ?? m.kind}</span>
                        <span className="tabular-nums text-on-surface-variant">×{m.quantity}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-on-surface-variant">
                        {locationLabel(m.fromLocation, siteName)} → {locationLabel(m.toLocation, siteName)}
                        {m.note ? ` · ${m.note}` : ""}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">{new Date(m.createdAt).toLocaleString()}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {/* Clear history button — only shown when there are movements */}
            {!isLoading && movements.length > 0 ? (
              <div className="border-t border-outline-variant/60 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-error/30 bg-error/10 px-3.5 py-2 text-xs font-semibold text-error transition-colors hover:bg-error/20"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear History
                </button>
              </div>
            ) : null}

            {/* Confirmation modal */}
            <AnimatePresence>
              {confirmOpen ? (
                <motion.div
                  className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setConfirmOpen(false)}
                >
                  <motion.div
                    className="w-full max-w-sm rounded-2xl border border-outline-variant bg-surface-container p-6"
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <h3 className="text-base font-bold text-white">Clear all history?</h3>
                    <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                      This will permanently delete <span className="font-semibold text-white">{movements.length}</span>{" "}
                      movement record{movements.length === 1 ? "" : "s"} for <span className="font-semibold text-white">{toolName}</span>.
                      This action cannot be undone.
                    </p>
                    <div className="mt-5 flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setConfirmOpen(false)}
                        disabled={clearing}
                        className="cursor-pointer rounded-xl px-4 py-2 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-white/5 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleClear()}
                        disabled={clearing}
                        className="cursor-pointer rounded-xl bg-error px-4 py-2 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:opacity-50"
                      >
                        {clearing ? "Clearing…" : "Clear History"}
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
