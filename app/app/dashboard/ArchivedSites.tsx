"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArchiveRestore, Trash2 } from "lucide-react";

import { requestJson } from "@/lib/http/client";
import { confirmDialog } from "@/lib/ui/confirm";
import { notifyError } from "@/lib/ui/toast";

type ArchivedSite = { siteId: string; name: string; location: string };

export function ArchivedSites({ sites }: { sites: ArchivedSite[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

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
    <section className="card-standard overflow-hidden">
      <div className="px-5 py-4 border-b border-white/5 bg-white/5">
        <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          Archived Sites
        </h2>
      </div>
      <ul className="divide-y divide-white/5">
        {sites.map((s) => (
          <li key={s.siteId} className="flex items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold uppercase tracking-tight text-slate-200">{s.name}</p>
              <p className="text-[10px] italic text-slate-500">{s.location}</p>
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
      </ul>
    </section>
  );
}
