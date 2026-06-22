"use client";

import { useState } from "react";

import { ModalShell } from "@/components/ui/motion";
import { addCtaLabel } from "@/lib/catalog/addCta";

export type CatalogSimilarityCandidate = {
  id: string;
  name: string;
  score: number;
  band: "high" | "medium";
};

// Result of an attempted create, returned by the caller's onCreate:
// - created: persisted; modal closes.
// - needs_override: a similar item exists; show suggestions + "Create anyway".
// - error: caller surfaced its own error; keep the modal open.
export type CatalogCreateResult =
  | { status: "created" }
  | { status: "needs_override"; candidates: CatalogSimilarityCandidate[] }
  | { status: "error" };

type Props = {
  // Contextual noun, e.g. "Work Type" -> "Add Work Type" / "Create Work Type".
  noun: string;
  disabled?: boolean;
  withRemark?: boolean;
  // Debounced live similarity check as the admin types (optional).
  onCheckSimilarity?: (name: string) => Promise<{ requiresReview: boolean } | null>;
  onCreate: (input: {
    name: string;
    remark: string | null;
    override: boolean;
  }) => Promise<CatalogCreateResult>;
};

export function CatalogAddModal({ noun, disabled, withRemark, onCheckSimilarity, onCreate }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [remark, setRemark] = useState("");
  const [creating, setCreating] = useState(false);
  const [requiresReview, setRequiresReview] = useState(false);
  const [confirmOverride, setConfirmOverride] = useState<CatalogSimilarityCandidate[] | null>(null);

  function reset() {
    setName("");
    setRemark("");
    setRequiresReview(false);
    setConfirmOverride(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function handleNameChange(next: string) {
    setName(next);
    setConfirmOverride(null);
    if (!onCheckSimilarity) return;
    const trimmed = next.trim();
    if (!trimmed) {
      setRequiresReview(false);
      return;
    }
    const result = await onCheckSimilarity(trimmed);
    setRequiresReview(Boolean(result?.requiresReview));
  }

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    const result = await onCreate({
      name: trimmed,
      remark: withRemark ? remark.trim() || null : null,
      override: Boolean(confirmOverride?.length),
    });
    setCreating(false);

    if (result.status === "created") {
      close();
      return;
    }
    if (result.status === "needs_override") {
      setConfirmOverride(result.candidates);
    }
    // error: leave the modal open; caller already surfaced the message.
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-sky-400 hover:bg-sky-500/20 transition-all disabled:opacity-40"
      >
        + {addCtaLabel(noun)}
      </button>

      <ModalShell
        open={open}
        onClose={close}
        className="w-full max-w-md rounded-2xl border border-outline-variant bg-surface-container-lowest p-4"
      >
        <div className="space-y-3">
          <h3 className="text-lg font-extrabold text-white">Create {noun}</h3>
          <input
            type="text"
            value={name}
            onChange={(e) => void handleNameChange(e.target.value)}
            placeholder={`${noun} name`}
            className="h-11 w-full rounded-xl border border-outline px-3"
          />

          {withRemark ? (
            <input
              type="text"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Remark (optional)"
              className="h-11 w-full rounded-xl border border-outline px-3"
            />
          ) : null}

          {confirmOverride?.length ? (
            <div className="rounded-xl border border-warning/50 bg-warning/10 p-3">
              <p className="text-xs font-semibold uppercase text-warning">Similar {noun.toLowerCase()} found</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {confirmOverride.slice(0, 4).map((item) => (
                  <li key={item.id} className="rounded-full bg-surface-container-low px-3 py-1 text-xs text-on-surface-variant">
                    {item.name} ({Math.round(item.score * 100)}%)
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {requiresReview && !confirmOverride?.length ? (
            <p className="text-xs font-semibold text-warning">This looks similar and will require admin review.</p>
          ) : null}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={!name.trim() || creating}
              onClick={() => void handleCreate()}
              className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold uppercase text-on-primary disabled:opacity-60"
            >
              {creating ? "Saving..." : confirmOverride?.length ? "Create anyway" : `Create ${noun}`}
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded-xl border border-outline px-4 py-2.5 text-sm font-semibold uppercase text-on-surface-variant"
            >
              Cancel
            </button>
          </div>
        </div>
      </ModalShell>
    </>
  );
}
