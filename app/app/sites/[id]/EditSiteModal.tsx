"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ModalShell } from "@/components/ui/motion";
import { requestJson } from "@/lib/http/client";
import { notifyError } from "@/lib/ui/toast";

type Supervisor = { userId: string; displayName: string };

type Site = {
  siteId: string;
  name: string;
  status: "In Progress" | "Blocked" | "Completed";
  budget: string | null;
  currentPhase: string | null;
  supervisorId: string;
};

const labelClass = "text-[11px] font-extrabold uppercase tracking-widest text-slate-400";
const inputClass = "input-standard bg-slate-900";

export function EditSiteModal({
  open,
  onClose,
  site,
  supervisors,
}: {
  open: boolean;
  onClose: () => void;
  site: Site;
  supervisors: Supervisor[];
}) {
  const router = useRouter();
  const [name, setName] = useState(site.name);
  const [status, setStatus] = useState<Site["status"]>(site.status);
  const [budget, setBudget] = useState(site.budget ?? "");
  const [phase, setPhase] = useState(site.currentPhase ?? "");
  const [supervisorId, setSupervisorId] = useState(site.supervisorId);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    const payload: Record<string, unknown> = {
      name: name.trim(),
      status,
      supervisorId,
    };
    if (phase.trim()) payload.currentPhase = phase.trim();
    const budgetNum = Number(budget);
    if (budget && Number.isFinite(budgetNum) && budgetNum > 0) payload.budget = budgetNum;

    setSaving(true);
    const res = await requestJson(`/api/sites/${site.siteId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      notifyError(res);
      return;
    }
    toast.success("Site updated");
    onClose();
    router.refresh();
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950 shadow-2xl"
    >
      <div className="space-y-4 p-5">
        <h3 className="text-lg font-extrabold uppercase tracking-tight text-white">Edit Site</h3>

        <div className="flex flex-col gap-2">
          <label className={labelClass}>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={255} className={inputClass} />
        </div>
        <div className="flex flex-col gap-2">
          <label className={labelClass}>Phase</label>
          <input value={phase} onChange={(e) => setPhase(e.target.value)} maxLength={100} className={inputClass} />
        </div>
        <div className="flex flex-col gap-2">
          <label className={labelClass}>Budget (₹)</label>
          <input type="number" min="0" step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} className={inputClass} />
        </div>
        <div className="flex flex-col gap-2">
          <label className={labelClass}>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as Site["status"])} className={`${inputClass} appearance-none`}>
            <option value="In Progress">In Progress</option>
            <option value="Blocked">Blocked</option>
            <option value="Completed">Completed</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label className={labelClass}>Supervisor</label>
          <select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)} className={`${inputClass} appearance-none`}>
            {supervisors.length === 0 ? <option value={site.supervisorId}>Current supervisor</option> : null}
            {supervisors.map((s) => (
              <option key={s.userId} value={s.userId}>{s.displayName}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary h-11 flex-1">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={saving} className="btn-primary h-11 flex-1 disabled:opacity-60">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
