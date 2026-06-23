"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { notifyError } from "@/lib/ui/toast";
import { motion } from "motion/react";
import { ChevronRight, Plus, Trash2, Loader2, AlertCircle } from "lucide-react";

import { ModalShell } from "@/components/ui/motion";
import { EntryTypeIcon, entryTypeFromName } from "@/components/constants/EntryTypeIcon";
import { requestJson } from "@/lib/http/client";

export type CategoryOption = {
  categoryId: string;
  name: string;
  icon?: string | null;
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

type CategoryCreateResponse = CategoryOption & {
  flaggedForReview?: boolean;
};

type CustomFieldDraft = {
  label: string;
  fieldType: "Text" | "Number";
  unit: string;
};

type Props = {
  initialCategories?: CategoryOption[];
  onSelect: (category: CategoryOption) => void;
  role: "Admin" | "Supervisor";
  siteId?: string;
};

export function CategoryPicker({ initialCategories = [], onSelect, role, siteId }: Props) {
  const [catalog, setCatalog] = useState<CategoryOption[]>(initialCategories);
  const [openModal, setOpenModal] = useState(false);
  const [name, setName] = useState("");
  const [remarks, setRemarks] = useState("");
  const [fields, setFields] = useState<CustomFieldDraft[]>([]);
  const [creating, setCreating] = useState(false);
  const [confirmOverride, setConfirmOverride] = useState<SimilarityCandidate[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [similarity, setSimilarity] = useState<SimilarityResponse | null>(null);

  const canCreate = useMemo(() => name.trim().length > 0, [name]);

  async function checkSimilarity(next: string) {
    const trimmed = next.trim();
    if (!trimmed) {
      setSimilarity(null);
      return;
    }
    const res = await requestJson<SimilarityResponse>("/api/forms/categories/similar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (!res.ok) return;
    setSimilarity(res.data);
  }

  function resetModal() {
    setName("");
    setRemarks("");
    setFields([]);
    setSimilarity(null);
    setConfirmOverride(null);
  }

  async function createCategory(overrideDuplicateWarning: boolean) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    const res = await requestJson<CategoryCreateResponse>("/api/forms/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: trimmed,
        overrideDuplicateWarning,
        siteId,
        customFields: fields.filter((f) => f.label.trim()),
        remarks,
      }),
    });

    if (!res.ok) {
      setCreating(false);
      if (res.status === 409) {
        const details = res.details as
          | { candidates?: SimilarityCandidate[]; requiresReview?: boolean }
          | undefined;
        if (details?.requiresReview && details.candidates?.length) {
          setConfirmOverride(details.candidates);
          return;
        }
      }
      notifyError(res);
      return;
    }

    const created = {
      categoryId: res.data.categoryId,
      name: res.data.name,
      icon: res.data.icon ?? null,
    };

    setCreating(false);
    setCatalog((prev) => (prev.find((item) => item.categoryId === created.categoryId) ? prev : [created, ...prev]));
    if (res.data.flaggedForReview) {
      toast.success(`Created "${created.name}" and flagged for admin review`);
    } else {
      toast.success(`Created "${created.name}"`);
    }

    resetModal();
    setOpenModal(false);
    onSelect(created);
  }

  async function handleDelete(category: CategoryOption) {
    if (role !== "Admin") return;
    const confirmed = window.confirm(`Delete category "${category.name}"?`);
    if (!confirmed) return;

    const prevCatalog = catalog;
    setCatalog((prev) => prev.filter((item) => item.categoryId !== category.categoryId));
    setDeletingId(category.categoryId);

    const res = await requestJson<null>(`/api/forms/categories/${category.categoryId}`, {
      method: "DELETE",
    });
    setDeletingId(null);

    if (!res.ok) {
      setCatalog(prevCatalog);
      notifyError(res);
      return;
    }
    toast.success(`Deleted "${category.name}"`);
  }

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between px-1 mb-6">
        <div>
          <h3 className="text-xl font-extrabold tracking-tight text-white uppercase">Select Log Category</h3>
          <p className="text-sm text-slate-500 font-medium italic mt-1.5">
            Pick the type of operation you want to record.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpenModal(true)}
          className="btn-secondary flex items-center gap-1.5 px-3 py-2"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      {/* Category grid */}
      <div className="grid grid-cols-1 gap-3">
        {catalog.map((c, i) => (
          <motion.div
            key={c.categoryId}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            className="card-standard group flex items-center justify-between text-left hover:bg-white/5 transition-all active:scale-[0.99]"
          >
            <button
              type="button"
              onClick={() => onSelect(c)}
              className="flex-1 flex items-center gap-5 p-5 text-left"
            >
              <div className="w-14 h-14 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-center shadow-lg transition-colors group-hover:bg-white/10 text-sky-400 shrink-0">
                {(() => {
                  const mappedType = entryTypeFromName(c.name);
                  return mappedType ? (
                    <EntryTypeIcon type={mappedType} className="w-8 h-8" />
                  ) : (
                    <span className="material-symbols-outlined text-[24px]">{c.icon ?? "category"}</span>
                  );
                })()}
              </div>
              <div className="space-y-1 min-w-0">
                <h4 className="font-bold text-slate-200 uppercase tracking-tight group-hover:text-sky-400 transition-colors">
                  {c.name}
                </h4>
              </div>
            </button>

            <div className="flex items-center gap-2 pr-4">
              {role === "Admin" && (
                <button
                  type="button"
                  onClick={() => void handleDelete(c)}
                  disabled={deletingId === c.categoryId}
                  title="Delete category"
                  aria-label={`Delete category ${c.name}`}
                  className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all disabled:opacity-40"
                >
                  {deletingId === c.categoryId ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => onSelect(c)}
                aria-label={`Open ${c.name}`}
                className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-slate-600 hover:bg-sky-500 hover:text-slate-950 transition-all"
              >
                <ChevronRight className="w-5 h-5 transition-transform hover:translate-x-0.5" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Add Category Modal */}
      <ModalShell
        open={openModal}
        onClose={() => { setOpenModal(false); resetModal(); }}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-surface p-6 shadow-2xl"
      >
        <div className="space-y-4">
          <h3 className="text-xl font-extrabold tracking-tight text-white uppercase">Add Category</h3>

          <div className="space-y-1.5">
            <label className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                void checkSimilarity(e.target.value);
              }}
              placeholder="e.g. Concrete Pouring"
              className="input-standard"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">Input Fields</p>
              <button
                type="button"
                onClick={() => setFields((prev) => [...prev, { label: "", fieldType: "Text", unit: "" }])}
                className="btn-secondary px-3 py-1.5 text-[10px]"
              >
                Add Field
              </button>
            </div>
            {fields.map((field, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 rounded-xl border border-white/5 bg-white/5 p-2">
                <input
                  type="text"
                  placeholder="Label"
                  value={field.label}
                  onChange={(e) => setFields((prev) => prev.map((item, i) => i === idx ? { ...item, label: e.target.value } : item))}
                  className="col-span-6 input-standard py-2"
                />
                <select
                  value={field.fieldType}
                  onChange={(e) => setFields((prev) => prev.map((item, i) => i === idx ? { ...item, fieldType: e.target.value as "Text" | "Number" } : item))}
                  className="col-span-3 input-standard py-2 appearance-none"
                >
                  <option value="Text" className="bg-slate-900">Text</option>
                  <option value="Number" className="bg-slate-900">Number</option>
                </select>
                <input
                  type="text"
                  placeholder="Unit"
                  value={field.unit}
                  onChange={(e) => setFields((prev) => prev.map((item, i) => i === idx ? { ...item, unit: e.target.value } : item))}
                  className="col-span-3 input-standard py-2"
                />
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">Remarks</label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
              placeholder="Optional note field"
              className="input-standard resize-none"
            />
          </div>

          {confirmOverride?.length ? (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400">Similar Categories Found</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {confirmOverride.slice(0, 4).map((item) => (
                    <span key={item.id} className="badge-amber">
                      {item.name} ({Math.round(item.score * 100)}%)
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {similarity?.requiresReview && !confirmOverride?.length ? (
            <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">
              ⚠ Similar category detected — will require admin review.
            </p>
          ) : null}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              disabled={!canCreate || creating}
              onClick={() => void createCategory(Boolean(confirmOverride?.length))}
              className="btn-primary flex-1 py-3"
            >
              {creating ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : confirmOverride?.length ? (
                "Create & Flag Review"
              ) : (
                "Create Category"
              )}
            </button>
            <button
              type="button"
              onClick={() => { setOpenModal(false); resetModal(); }}
              className="btn-secondary px-6 py-3"
            >
              Cancel
            </button>
          </div>
        </div>
      </ModalShell>
    </div>
  );
}
