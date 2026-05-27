"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ModalShell } from "@/components/ui/motion";
import { requestJson } from "@/lib/http/client";

export type SubcategoryOption = {
  subcategoryId: string;
  name: string;
  categoryId: string;
};

type SimilarityCandidate = {
  id: string;
  name: string;
  score: number;
  band: "high" | "medium";
};

type SimilarityResponse = {
  candidates: SimilarityCandidate[];
  topScore: number;
  recommendedAction: "use_existing" | "create_new";
  requiresReview: boolean;
};

type SubcategoryListResponse = {
  subcategories: Array<{
    subcategoryId: string;
    categoryId: string;
    name: string;
  }>;
};

type SubcategoryCreateResponse = SubcategoryOption & {
  flaggedForReview?: boolean;
};

type Props = {
  label: string;
  parentCategoryId: string;
  value: SubcategoryOption | null;
  onChange: (value: SubcategoryOption | null) => void;
  required?: boolean;
  role: "Admin" | "Supervisor";
  siteId?: string;
};

export function SubcategoryCombobox({
  label, parentCategoryId, value, onChange, required, role, siteId,
}: Props) {
  const [catalog, setCatalog] = useState<SubcategoryOption[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [openModal, setOpenModal] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [similarity, setSimilarity] = useState<SimilarityResponse | null>(null);
  const [confirmOverride, setConfirmOverride] = useState<SimilarityCandidate[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!parentCategoryId) {
      setCatalog([]);
      return;
    }
    const controller = new AbortController();
    setLoadingCatalog(true);
    void (async () => {
      const res = await requestJson<SubcategoryListResponse>(
        `/api/forms/categories/${parentCategoryId}`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setLoadingCatalog(false);
      if (!res.ok) {
        if (res.message !== "Request aborted") toast.error(res.message);
        return;
      }
      setCatalog((res.data.subcategories ?? []).map((item) => ({
        subcategoryId: item.subcategoryId,
        name: item.name,
        categoryId: parentCategoryId,
      })));
    })();
    return () => controller.abort();
  }, [parentCategoryId]);

  async function checkSimilarity(next: string) {
    const trimmed = next.trim();
    if (!trimmed || !parentCategoryId) {
      setSimilarity(null);
      return;
    }
    const res = await requestJson<SimilarityResponse>("/api/forms/subcategories/similar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: trimmed, categoryId: parentCategoryId }),
    });
    if (!res.ok) return;
    setSimilarity(res.data);
  }

  function resetModal() {
    setName("");
    setSimilarity(null);
    setConfirmOverride(null);
  }

  async function createSubcategory(overrideDuplicateWarning: boolean) {
    const trimmed = name.trim();
    if (!trimmed || !parentCategoryId) return;
    setCreating(true);
    const res = await requestJson<SubcategoryCreateResponse>("/api/forms/subcategories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: trimmed,
        categoryId: parentCategoryId,
        overrideDuplicateWarning,
        siteId,
      }),
    });
    setCreating(false);

    if (!res.ok) {
      if (res.status === 409) {
        const details = res.details as
          | { candidates?: SimilarityCandidate[]; requiresReview?: boolean }
          | undefined;
        if (details?.requiresReview && details.candidates?.length) {
          setConfirmOverride(details.candidates);
          return;
        }
      }
      toast.error(res.message);
      return;
    }

    const created = {
      subcategoryId: res.data.subcategoryId,
      name: res.data.name,
      categoryId: parentCategoryId,
    };
    setCatalog((prev) => prev.find((item) => item.subcategoryId === created.subcategoryId) ? prev : [created, ...prev]);
    if (res.data.flaggedForReview) {
      toast.success(`Created "${res.data.name}" and flagged for admin review`);
    } else {
      toast.success(`Created "${res.data.name}"`);
    }
    onChange(created);
    setOpenModal(false);
    resetModal();
  }

  async function handleDelete(option: SubcategoryOption) {
    if (role !== "Admin") return;
    const confirmed = window.confirm(`Delete subcategory "${option.name}"?`);
    if (!confirmed) return;

    const prevCatalog = catalog;
    setCatalog((p) => p.filter((item) => item.subcategoryId !== option.subcategoryId));
    if (value?.subcategoryId === option.subcategoryId) onChange(null);
    setDeletingId(option.subcategoryId);

    const res = await requestJson<null>(`/api/forms/subcategories/${option.subcategoryId}`, {
      method: "DELETE",
    });
    setDeletingId(null);
    if (!res.ok) {
      setCatalog(prevCatalog);
      toast.error(res.message);
      return;
    }
    toast.success(`Deleted "${option.name}"`);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
          {label}
          {required && " *"}
        </label>
        <button
          type="button"
          onClick={() => setOpenModal(true)}
          className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-sky-400 hover:bg-sky-500/20 transition-all"
        >
          + Add Subcategory
        </button>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={value?.subcategoryId ?? ""}
          onChange={(e) => {
            const found = catalog.find((s) => s.subcategoryId === e.target.value) ?? null;
            onChange(found);
          }}
          required={required}
          disabled={loadingCatalog}
          className="input-standard appearance-none bg-slate-900 flex-1"
        >
          <option value="" className="bg-slate-900">
            {loadingCatalog ? "Loading\u2026" : catalog.length === 0 ? "No subcategories yet" : "Select\u2026"}
          </option>
          {catalog.map((s) => (
            <option key={s.subcategoryId} value={s.subcategoryId} className="bg-slate-900">
              {s.name}
            </option>
          ))}
        </select>

        {role === "Admin" && value && (
          <button
            type="button"
            onClick={() => void handleDelete(value)}
            disabled={deletingId === value.subcategoryId}
            aria-label="Delete subcategory"
            className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-40"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>delete</span>
          </button>
        )}
      </div>


      <ModalShell open={openModal} onClose={() => { setOpenModal(false); resetModal(); }} className="w-full max-w-md rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
        <div className="space-y-3">
          <h3 className="text-lg font-extrabold text-white">Create Subcategory</h3>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              void checkSimilarity(e.target.value);
            }}
            placeholder="Subcategory name"
            className="h-11 w-full rounded-xl border border-outline px-3"
          />

          {confirmOverride?.length ? (
            <div className="rounded-xl border border-warning/50 bg-warning/10 p-3">
              <p className="text-xs font-semibold uppercase text-warning">Similar subcategories found</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {confirmOverride.slice(0, 4).map((item) => (
                  <li key={item.id} className="rounded-full bg-surface-container-low px-3 py-1 text-xs text-on-surface-variant">
                    {item.name} ({Math.round(item.score * 100)}%)
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {similarity?.requiresReview && !confirmOverride?.length ? (
            <p className="text-xs font-semibold text-warning">This looks similar and will require admin review.</p>
          ) : null}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={!name.trim() || creating}
              onClick={() => void createSubcategory(Boolean(confirmOverride?.length))}
              className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold uppercase text-on-primary disabled:opacity-60"
            >
              {creating ? "Saving..." : confirmOverride?.length ? "Create & Flag Review" : "Create Subcategory"}
            </button>
            <button
              type="button"
              onClick={() => { setOpenModal(false); resetModal(); }}
              className="rounded-xl border border-outline px-4 py-2.5 text-sm font-semibold uppercase text-on-surface-variant"
            >
              Cancel
            </button>
          </div>
        </div>
      </ModalShell>
    </div>
  );
}
