"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";

import { ModalShell } from "@/components/ui/motion";

type Props = {
  open: boolean;
  /** Noun for copy, e.g. "Work Type" / "Unit" / "Tool". */
  noun: string;
  currentName: string;
  onClose: () => void;
  /** Return true on success (modal closes), false to keep it open. */
  onSubmit: (nextName: string) => Promise<boolean>;
};

// Dedicated rename dialog — replaces window.prompt so renaming is on-brand,
// validated, and keyboard-friendly (Enter submits, Escape/ backdrop closes).
export function RenameModal({ open, noun, currentName, onClose, onSubmit }: Props) {
  const [value, setValue] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reseed the field whenever a new target opens.
  useEffect(() => {
    if (open) {
      setValue(currentName);
      setSaving(false);
      // Focus + select after the modal mounts.
      const id = window.setTimeout(() => inputRef.current?.select(), 50);
      return () => window.clearTimeout(id);
    }
  }, [open, currentName]);

  const trimmed = value.trim();
  const canSave = trimmed.length > 0 && trimmed !== currentName && !saving;

  async function handleSubmit() {
    if (!canSave) return;
    setSaving(true);
    const ok = await onSubmit(trimmed);
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0b1220] p-5 shadow-2xl"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/20">
            <Pencil className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-lg font-extrabold text-white">Rename {noun}</h3>
            <p className="truncate text-xs text-slate-500">Currently "{currentName}"</p>
          </div>
        </div>

        <div>
          <label htmlFor="rename-input" className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-400">
            New name
          </label>
          <input
            id="rename-input"
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSubmit();
            }}
            placeholder={`${noun} name`}
            className="input-standard"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold uppercase tracking-widest text-slate-300 transition-colors hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => void handleSubmit()}
            className="flex-1 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold uppercase tracking-widest text-slate-950 transition-colors hover:bg-sky-400 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
