"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { notifyError } from "@/lib/ui/toast";

import { CatalogAddModal, type CatalogCreateResult } from "@/components/catalog/CatalogAddModal";
import { requestJson } from "@/lib/http/client";

export type SubcategoryOption = {
  subcategoryId: string;
  name: string;
  categoryId: string;
};

type SimilarityResponse = {
  requiresReview: boolean;
  candidates: Array<{ id: string; name: string; score: number; band: "high" | "medium" }>;
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
  // Contextual noun for the add CTA ("Work Type" -> "Add Work Type").
  // Defaults to the field label.
  noun?: string;
};

export function SubcategoryCombobox({
  label, parentCategoryId, value, onChange, required, role, siteId, noun,
}: Props) {
  const [catalog, setCatalog] = useState<SubcategoryOption[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const selectedCatalogValue = value
    ? catalog.find((item) => item.subcategoryId === value.subcategoryId || item.name === value.name) ?? value
    : null;
  // Contextual noun for user-facing copy ("Work Type", "Material Type", …).
  const itemNoun = noun ?? label;
  const itemNounLower = itemNoun.toLowerCase();

  function mergeCurrentValue(options: SubcategoryOption[]) {
    if (!value) return options;
    return options.some((item) => item.subcategoryId === value.subcategoryId || item.name === value.name)
      ? options
      : [value, ...options];
  }

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
        if (res.message !== "Request aborted") notifyError(res);
        return;
      }
      const nextCatalog = (res.data.subcategories ?? []).map((item) => ({
        subcategoryId: item.subcategoryId,
        name: item.name,
        categoryId: parentCategoryId,
      }));
      setCatalog(mergeCurrentValue(nextCatalog));
    })();
    return () => controller.abort();
  }, [parentCategoryId, value]);

  useEffect(() => {
    setCatalog((current) => mergeCurrentValue(current));
  }, [value]);

  async function checkSimilarity(name: string) {
    if (!parentCategoryId) return null;
    const res = await requestJson<SimilarityResponse>("/api/forms/subcategories/similar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, categoryId: parentCategoryId }),
    });
    return res.ok ? { requiresReview: res.data.requiresReview } : null;
  }

  async function createSubcategory({
    name, remark, override,
  }: { name: string; remark: string | null; override: boolean }): Promise<CatalogCreateResult> {
    if (!parentCategoryId) return { status: "error" };
    const res = await requestJson<SubcategoryCreateResponse>("/api/forms/subcategories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        categoryId: parentCategoryId,
        overrideDuplicateWarning: override,
        remarks: remark ?? undefined,
        siteId,
      }),
    });

    if (!res.ok) {
      if (res.status === 409) {
        const details = res.details as
          | { candidates?: SimilarityResponse["candidates"]; requiresReview?: boolean }
          | undefined;
        if (details?.requiresReview && details.candidates?.length) {
          return { status: "needs_override", candidates: details.candidates };
        }
      }
      notifyError(res);
      return { status: "error" };
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
    return { status: "created" };
  }

  async function handleDelete(option: SubcategoryOption) {
    if (role !== "Admin") return;
    const confirmed = window.confirm(`Delete ${itemNounLower} "${option.name}"?`);
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
      notifyError(res);
      return;
    }
    toast.success(`Deleted "${option.name}"`);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
          {label}
          {required && " *"}
        </label>
        <CatalogAddModal
          noun={itemNoun}
          disabled={!parentCategoryId}
          withRemark
          onCheckSimilarity={checkSimilarity}
          onCreate={createSubcategory}
        />
      </div>

      <div className="flex items-center gap-2">
        <select
          value={selectedCatalogValue?.subcategoryId ?? ""}
          onChange={(e) => {
            const found = catalog.find((s) => s.subcategoryId === e.target.value) ?? null;
            onChange(found);
          }}
          required={required}
          disabled={loadingCatalog}
          className="input-standard appearance-none bg-slate-900 flex-1"
        >
          <option value="" className="bg-slate-900">
            {loadingCatalog ? "Loading…" : catalog.length === 0 ? `No ${itemNounLower} yet` : "Select…"}
          </option>
          {catalog.map((s) => (
            <option key={s.subcategoryId} value={s.subcategoryId} className="bg-slate-900">
              {s.name}
            </option>
          ))}
        </select>

        {role === "Admin" && selectedCatalogValue && (
          <button
            type="button"
            onClick={() => void handleDelete(selectedCatalogValue)}
            disabled={deletingId === selectedCatalogValue.subcategoryId}
            aria-label={`Delete ${itemNounLower}`}
            className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-40"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>delete</span>
          </button>
        )}
      </div>
    </div>
  );
}
