"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { requestJson } from "@/lib/http/client";

export type TransferSiteOption = {
  siteId: string;
  name: string;
  location?: string;
};

type Props = {
  sites: TransferSiteOption[];
  defaultFromSiteId?: string;
  onSuccess?: () => void;
};

type ResourceType = "Labour" | "Materials";

const LABOUR_WORK_TYPES = [
  "Steel work",
  "Shuttering",
  "Brick work",
  "Concrete work",
  "Plastering",
  "Electric work",
  "Plumbing",
  "Tile work",
  "Wood work",
  "Paint work",
] as const;

const MATERIAL_TYPES = ["Cement", "M sand", "P sand", "Metal"] as const;

const labelClass = "font-label-md text-label-md uppercase text-on-surface-variant";
const inputClass =
  "h-11 w-full rounded border border-outline bg-surface-container-lowest px-3 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
const textareaClass =
  "min-h-[88px] w-full rounded border border-outline bg-surface-container-lowest p-3 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

export function TransferForm({ sites, defaultFromSiteId, onSuccess }: Props) {
  const router = useRouter();
  const [fromSite, setFromSite] = useState(defaultFromSiteId ?? "");
  const [toSite, setToSite] = useState("");
  const [resourceType, setResourceType] = useState<ResourceType>("Labour");
  const [workTypeEnum, setWorkTypeEnum] = useState<string>(LABOUR_WORK_TYPES[0]);
  const [materialTypeEnum, setMaterialTypeEnum] = useState<string>(MATERIAL_TYPES[0]);
  const [unitCustomId, setUnitCustomId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!fromSite || !toSite) {
      toast.error("Select both sites");
      return;
    }
    if (fromSite === toSite) {
      toast.error("Source and destination sites must differ");
      return;
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("Quantity must be positive");
      return;
    }
    if (resourceType === "Materials" && !unitCustomId) {
      toast.error("Unit ID is required for material transfers");
      return;
    }

    const payload: Record<string, unknown> = {
      fromSiteId: fromSite,
      toSiteId: toSite,
      resourceType,
      quantity: qty,
      remarks: remarks || undefined,
    };

    if (resourceType === "Labour") {
      payload.workTypeMode = "default_enum";
      payload.workTypeEnum = workTypeEnum;
    } else {
      payload.materialTypeMode = "default_enum";
      payload.materialTypeEnum = materialTypeEnum;
      payload.unitMode = "custom";
      payload.unitCustomId = unitCustomId;
    }

    setSubmitting(true);
    const res = await requestJson<{ transferId: string }>("/api/transfers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSubmitting(false);

    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success("Transfer request submitted");
    if (onSuccess) onSuccess();
    else router.push(`/app/sites/${fromSite}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor="fromSite" className={labelClass}>From Site *</label>
          <select id="fromSite" value={fromSite} onChange={(e) => setFromSite(e.target.value)} required className={inputClass}>
            <option value="">Select source…</option>
            {sites.map((s) => (
              <option key={s.siteId} value={s.siteId}>
                {s.name}
                {s.location ? ` (${s.location})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="toSite" className={labelClass}>To Site *</label>
          <select id="toSite" value={toSite} onChange={(e) => setToSite(e.target.value)} required className={inputClass}>
            <option value="">Select destination…</option>
            {sites
              .filter((s) => s.siteId !== fromSite)
              .map((s) => (
                <option key={s.siteId} value={s.siteId}>
                  {s.name}
                  {s.location ? ` (${s.location})` : ""}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className={labelClass}>Resource Type *</label>
        <div className="grid grid-cols-2 gap-2">
          {(['Labour', 'Materials'] as ResourceType[]).map((rt) => (
            <button
              key={rt}
              type="button"
              onClick={() => setResourceType(rt)}
              className={[
                'flex h-11 items-center justify-center gap-2 rounded border font-label-md text-label-md uppercase transition-colors',
                resourceType === rt
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-outline-variant bg-surface-container-lowest text-on-surface-variant',
              ].join(' ')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                {rt === 'Labour' ? 'engineering' : 'inventory_2'}
              </span>
              {rt}
            </button>
          ))}
        </div>
      </div>

      {resourceType === "Labour" ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="workType" className={labelClass}>Work Type *</label>
          <select id="workType" value={workTypeEnum} onChange={(e) => setWorkTypeEnum(e.target.value)} required className={inputClass}>
            {LABOUR_WORK_TYPES.map((wt) => (
              <option key={wt} value={wt}>{wt}</option>
            ))}
          </select>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <label htmlFor="materialType" className={labelClass}>Material Type *</label>
            <select id="materialType" value={materialTypeEnum} onChange={(e) => setMaterialTypeEnum(e.target.value)} required className={inputClass}>
              {MATERIAL_TYPES.map((mt) => (
                <option key={mt} value={mt}>{mt}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="unitId" className={labelClass}>Unit ID *</label>
            <input
              id="unitId"
              type="text"
              value={unitCustomId}
              onChange={(e) => setUnitCustomId(e.target.value)}
              placeholder="Unit UUID"
              required
              className={inputClass}
            />
          </div>
        </>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="quantity" className={labelClass}>Quantity *</label>
        <input
          id="quantity"
          type="number"
          min="0"
          step="0.01"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          required
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="remarks" className={labelClass}>Remarks</label>
        <textarea id="remarks" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} className={textareaClass} />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded bg-primary font-label-md text-label-md uppercase text-on-primary hover:bg-surface-tint disabled:opacity-60"
      >
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>swap_horiz</span>
        {submitting ? "Submitting…" : "Request Transfer"}
      </button>
    </form>
  );
}
