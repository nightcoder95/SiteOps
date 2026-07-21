"use client";

import { useState } from "react";
import { toast } from "sonner";

import { ModalShell } from "@/components/ui/motion";
import { useToolMutations, type ToolCategoryDTO } from "@/lib/client/tools";
import { notifyError } from "@/lib/ui/toast";

// Add-tool flow lifted out of the inline toolbar into a focused modal, mirroring
// CatalogAddModal. Same validation/behaviour as the old inline form.
export function ToolAddModal({
  open,
  onClose,
  categories,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  categories: ToolCategoryDTO[];
  onCreated: () => Promise<unknown> | void;
}) {
  const { createTool } = useToolMutations();
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [opening, setOpening] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setName("");
    setCategoryId("");
    setOpening("");
  }

  function close() {
    reset();
    onClose();
  }

  async function create() {
    const n = name.trim();
    if (!n || !categoryId) return;
    const openingStock = opening.trim() ? Math.max(0, Math.floor(Number(opening))) : undefined;
    setBusy(true);
    const res = await createTool({ name: n, categoryId, openingStock });
    setBusy(false);
    if (!res.ok) return notifyError(res);
    toast.success(`Added tool "${res.data.name}" (${res.data.code})`);
    await onCreated();
    close();
  }

  return (
    <ModalShell
      open={open}
      onClose={close}
      className="w-full max-w-md rounded-2xl border border-outline-variant bg-surface-container-lowest p-5"
    >
      <div className="space-y-3.5">
        <h3 className="text-base font-bold text-white">Add tool</h3>

        <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
          Name
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Manvatti"
            className="h-10 w-full rounded-xl border border-outline px-3 text-sm normal-case text-on-surface"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
          Category
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="h-10 w-full cursor-pointer rounded-xl border border-outline px-3 text-sm text-on-surface"
          >
            <option value="">Select…</option>
            {categories.map((c) => (
              <option key={c.categoryId} value={c.categoryId}>
                {c.name} ({c.codePrefix})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
          Opening stock
          <input
            type="number"
            min={0}
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
            placeholder="0"
            className="h-10 w-full rounded-xl border border-outline px-3 text-sm text-on-surface"
          />
        </label>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            disabled={!name.trim() || !categoryId || busy}
            onClick={() => void create()}
            className="flex-1 cursor-pointer rounded-xl bg-primary px-4 py-2.5 text-sm font-bold uppercase text-on-primary transition-colors hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Add tool"}
          </button>
          <button
            type="button"
            onClick={close}
            className="cursor-pointer rounded-xl border border-outline px-4 py-2.5 text-sm font-semibold uppercase text-on-surface-variant transition-colors hover:bg-surface-container-low"
          >
            Cancel
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
