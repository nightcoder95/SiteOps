"use client";

import { Trash2 } from 'lucide-react';
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ModalShell } from "@/components/ui/motion";
import { requestJson } from "@/lib/http/client";
import { notifyError } from "@/lib/ui/toast";

const PHRASE = "I am Sure";

export function DangerZone() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function purge() {
    setBusy(true);
    const res = await requestJson("/api/admin/purge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: PHRASE }),
    });
    setBusy(false);
    if (!res.ok) {
      notifyError(res);
      return;
    }
    toast.success("All data deleted");
    setOpen(false);
    setText("");
    router.refresh();
  }

  return (
    <section className="card-standard flex flex-col gap-3 rounded-2xl border border-red-500/20 p-4">
      <h3 className="text-lg font-extrabold tracking-tight text-error">Danger Zone</h3>
      <p className="text-xs text-on-surface-variant">
        Permanently delete every site and all logs across the workspace. User accounts are kept.
        This cannot be undone.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 w-full items-center justify-center gap-2 rounded border border-red-500/40 bg-red-500/10 text-xs font-semibold uppercase text-error transition-all hover:bg-red-500/20 active:scale-[0.98]"
      >
        <Trash2 className="w-[18px] h-[18px]" />
        Delete Everything
      </button>

      <ModalShell
        open={open}
        onClose={() => setOpen(false)}
        className="w-full max-w-md rounded-2xl border border-red-500/20 bg-slate-950 shadow-2xl"
      >
        <div className="space-y-4 p-5">
          <h3 className="text-lg font-extrabold uppercase tracking-tight text-white">Delete everything?</h3>
          <p className="text-sm text-slate-400">
            This removes all sites and logs for the whole workspace. Type{" "}
            <span className="font-bold text-white">{PHRASE}</span> to confirm.
          </p>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={PHRASE}
            className="input-standard bg-slate-900"
          />
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary h-11 flex-1">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void purge()}
              disabled={busy || text !== PHRASE}
              className="h-11 flex-1 rounded-2xl border border-red-500/40 bg-red-500/20 text-xs font-extrabold uppercase tracking-widest text-red-300 transition-colors hover:bg-red-500/30 disabled:opacity-40"
            >
              {busy ? "Deleting…" : "Delete everything"}
            </button>
          </div>
        </div>
      </ModalShell>
    </section>
  );
}
