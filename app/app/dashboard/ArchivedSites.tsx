"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Archive, ArchiveRestore, ChevronRight, Trash2 } from "lucide-react";

import { requestJson } from "@/lib/http/client";
import { confirmDialog } from "@/lib/ui/confirm";
import { notifyError } from "@/lib/ui/toast";

type ArchivedSite = { siteId: string; name: string; location: string };

export function ArchivedSites({ sites }: { sites: ArchivedSite[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  if (sites.length === 0) return null;

  async function restore(siteId: string) {
    setBusyId(siteId);
    const res = await requestJson(`/api/sites/${siteId}/restore`, { method: "POST" });
    setBusyId(null);
    if (!res.ok) {
      notifyError(res);
      return;
    }
    toast.success("Site restored");
    router.refresh();
  }

  async function purge(site: ArchivedSite) {
    const ok = await confirmDialog({
      title: "Delete permanently?",
      message: `"${site.name}" and all its data will be removed from the app. This cannot be undone.`,
      confirmLabel: "Delete permanently",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (!ok) return;
    setBusyId(site.siteId);
    const res = await requestJson(`/api/sites/${site.siteId}?permanent=true`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      notifyError(res);
      return;
    }
    toast.success("Site deleted");
    router.refresh();
  }

  return (
    <section className="card-standard">
      {/* Summary row — expands to the managed list */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/5 text-slate-400 ring-1 ring-white/10">
          <Archive className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-white">Archived Sites</p>
          <p className="truncate text-xs text-slate-500">View and manage archived projects</p>
        </div>
        <span className="grid h-7 min-w-7 place-items-center rounded-full bg-white/10 px-2 text-xs font-bold tabular-nums text-slate-300">
          {sites.length}
        </span>
        <ChevronRight
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="divide-y divide-white/5 overflow-hidden border-t border-white/5"
          >
            {sites.map((s) => (
              <li key={s.siteId} className="flex items-center justify-between gap-3 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold uppercase tracking-tight text-slate-200">{s.name}</p>
                  <p className="text-[11px] text-slate-500">{s.location}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => void restore(s.siteId)}
                    disabled={busyId === s.siteId}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-300 transition-colors hover:text-sky-400 disabled:opacity-50"
                  >
                    <ArchiveRestore className="h-3.5 w-3.5" /> Restore
                  </button>
                  <button
                    onClick={() => void purge(s)}
                    disabled={busyId === s.siteId}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
