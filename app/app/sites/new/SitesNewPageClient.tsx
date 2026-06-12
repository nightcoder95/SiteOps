"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { notifyError } from "@/lib/ui/toast";

import { can } from "@/lib/auth/capabilities";
import { requestJson } from "@/lib/http/client";

type Supervisor = { userId: string; displayName: string };

type Props = {
  role: "Admin" | "Supervisor";
  supervisors: Supervisor[];
};

type CreatedSite = { siteId: string };

const labelClass = "text-xs font-semibold uppercase text-on-surface-variant";
const inputClass =
  "h-11 w-full rounded border border-outline bg-surface-container-lowest px-3 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

export function SitesNewPageClient({ role, supervisors }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [budget, setBudget] = useState("");
  const [currentPhase, setCurrentPhase] = useState("");
  const [supervisorId, setSupervisorId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !location.trim()) {
      toast.error("Name and location are required");
      return;
    }
    const budgetNum = Number(budget);
    if (!Number.isFinite(budgetNum) || budgetNum <= 0) {
      toast.error("Budget must be a positive number");
      return;
    }

    const payload: Record<string, unknown> = {
      name: name.trim(),
      location: location.trim(),
      budget: budgetNum,
    };
    if (currentPhase.trim()) payload.currentPhase = currentPhase.trim();
    if (can(role, "resource:manage_all") && supervisorId) payload.supervisorId = supervisorId;

    setSubmitting(true);
    const res = await requestJson<CreatedSite>("/api/sites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSubmitting(false);

    if (!res.ok) {
      notifyError(res);
      return;
    }
    toast.success("Site created");
    router.push(`/app/sites/${res.data.siteId}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h2 className="text-lg font-bold text-white">Create Site</h2>
        <p className="text-sm text-on-surface-variant">
          Add a new construction site to your operations roster.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="name" className={labelClass}>Name *</label>
          <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required maxLength={255} className={inputClass} />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="location" className={labelClass}>Location *</label>
          <input id="location" type="text" value={location} onChange={(e) => setLocation(e.target.value)} required maxLength={255} className={inputClass} />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="budget" className={labelClass}>Budget (₹) *</label>
          <input id="budget" type="number" min="0" step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} required className={inputClass} />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="phase" className={labelClass}>Current Phase</label>
          <input id="phase" type="text" value={currentPhase} onChange={(e) => setCurrentPhase(e.target.value)} placeholder="e.g. Foundation" maxLength={100} className={inputClass} />
        </div>

        {can(role, "resource:manage_all") && (
          <div className="flex flex-col gap-2">
            <label htmlFor="supervisor" className={labelClass}>Supervisor</label>
            <select id="supervisor" value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)} className={inputClass}>
              <option value="">Assign to me</option>
              {supervisors.map((s) => (
                <option key={s.userId} value={s.userId}>
                  {s.displayName}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded bg-primary text-xs font-semibold uppercase text-on-primary hover:bg-sky-400 disabled:opacity-60"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add_location</span>
          {submitting ? "Creating…" : "Create Site"}
        </button>
      </form>
    </div>
  );
}
