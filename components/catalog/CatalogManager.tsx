"use client";

import { useState } from "react";
import { toast } from "sonner";

import { AllowedUnitsEditor } from "@/components/catalog/AllowedUnitsEditor";
import { CatalogAddModal, type CatalogCreateResult } from "@/components/catalog/CatalogAddModal";
import type { CatalogOverviewList, CatalogOverviewOperation } from "@/lib/catalog/overview";
import { requestJson } from "@/lib/http/client";
import { useApiResult } from "@/lib/http/useApiQuery";
import { notifyError } from "@/lib/ui/toast";

type OverviewResponse = { operations: CatalogOverviewOperation[] };

type SimilarCandidate = { id: string; name: string; score: number; band: "high" | "medium" };

export function CatalogManager() {
  const { data: result, mutate, isLoading } = useApiResult<OverviewResponse>("/api/admin/catalog");
  const [activeOperation, setActiveOperation] = useState(0);
  const [showInactive, setShowInactive] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Merge flow: pick a source row, then a target row in the same list.
  const [mergeSource, setMergeSource] = useState<{ id: string; name: string; listKey: string } | null>(null);
  // Allowed-units editor target (material subcategory rows only).
  const [unitsFor, setUnitsFor] = useState<{ id: string; name: string } | null>(null);

  const operations = result?.ok ? result.data.operations : [];
  const current = operations[activeOperation];

  async function patch(subcategoryId: string, body: Record<string, unknown>) {
    setBusyId(subcategoryId);
    const res = await requestJson(`/api/forms/subcategories/${subcategoryId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusyId(null);
    if (!res.ok) {
      notifyError(res);
      return false;
    }
    await mutate();
    return true;
  }

  async function toggleActive(item: CatalogOverviewList["items"][number]) {
    if (await patch(item.subcategoryId, { isActive: !item.isActive })) {
      toast.success(`${item.isActive ? "Deactivated" : "Activated"} "${item.name}"`);
    }
  }

  async function rename(item: CatalogOverviewList["items"][number]) {
    const next = window.prompt(`Rename "${item.name}" to:`, item.name)?.trim();
    if (!next || next === item.name) return;
    if (await patch(item.subcategoryId, { name: next })) {
      toast.success(`Renamed to "${next}"`);
    }
  }

  async function reorder(list: CatalogOverviewList, index: number, direction: -1 | 1) {
    const a = list.items[index];
    const b = list.items[index + direction];
    if (!a || !b) return;
    // Swap sort orders. If they currently tie, nudge to make the move visible.
    const aOrder = a.sortOrder;
    const bOrder = b.sortOrder === aOrder ? aOrder + direction : b.sortOrder;
    setBusyId(a.subcategoryId);
    const ok1 = await requestJson(`/api/forms/subcategories/${a.subcategoryId}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sortOrder: bOrder }),
    });
    const ok2 = await requestJson(`/api/forms/subcategories/${b.subcategoryId}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sortOrder: aOrder }),
    });
    setBusyId(null);
    if (!ok1.ok) return notifyError(ok1);
    if (!ok2.ok) return notifyError(ok2);
    await mutate();
  }

  async function mergeInto(target: CatalogOverviewList["items"][number]) {
    if (!mergeSource || mergeSource.id === target.subcategoryId) return;
    if (!window.confirm(`Merge "${mergeSource.name}" into "${target.name}"? Entries will be rewritten and the source deactivated.`)) {
      return;
    }
    setBusyId(target.subcategoryId);
    const res = await requestJson("/api/admin/catalog/merge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceId: mergeSource.id, targetId: target.subcategoryId }),
    });
    setBusyId(null);
    if (!res.ok) {
      notifyError(res);
      return;
    }
    toast.success(`Merged "${mergeSource.name}" into "${target.name}"`);
    setMergeSource(null);
    await mutate();
  }

  function makeCheckSimilarity(categoryId: string | null) {
    return async (name: string) => {
      if (!categoryId) return null;
      const res = await requestJson<{ requiresReview: boolean }>("/api/forms/subcategories/similar", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, categoryId }),
      });
      return res.ok ? { requiresReview: res.data.requiresReview } : null;
    };
  }

  function makeCreate(categoryId: string | null, noun: string) {
    return async ({ name, remark, override }: { name: string; remark: string | null; override: boolean }): Promise<CatalogCreateResult> => {
      if (!categoryId) return { status: "error" };
      const res = await requestJson<{ name: string }>("/api/forms/subcategories", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, categoryId, overrideDuplicateWarning: override, remarks: remark ?? undefined }),
      });
      if (!res.ok) {
        if (res.status === 409) {
          const details = res.details as { candidates?: SimilarCandidate[]; requiresReview?: boolean } | undefined;
          if (details?.requiresReview && details.candidates?.length) {
            return { status: "needs_override", candidates: details.candidates };
          }
        }
        notifyError(res);
        return { status: "error" };
      }
      toast.success(`Added ${noun} "${res.data.name}"`);
      await mutate();
      return { status: "created" };
    };
  }

  if (isLoading) return <p className="text-sm text-on-surface-variant">Loading catalog…</p>;
  if (result && !result.ok) return <p className="text-sm text-error">Failed to load catalog.</p>;

  return (
    <div className="space-y-5">
      {/* Operation tabs */}
      <div className="flex flex-wrap gap-2">
        {operations.map((op, i) => (
          <button
            key={op.operation}
            type="button"
            onClick={() => setActiveOperation(i)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${
              i === activeOperation
                ? "bg-primary text-on-primary"
                : "border border-outline text-on-surface-variant hover:bg-surface-container-low"
            }`}
          >
            {op.operation}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 text-xs font-semibold uppercase text-on-surface-variant">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
        Show inactive
      </label>

      {current?.lists.map((list) => {
        const items = showInactive ? list.items : list.items.filter((i) => i.isActive);
        return (
          <section key={list.key} className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-white">{list.noun}</h2>
              <CatalogAddModal
                noun={list.noun}
                disabled={!list.categoryId}
                withRemark
                onCheckSimilarity={makeCheckSimilarity(list.categoryId)}
                onCreate={makeCreate(list.categoryId, list.noun)}
              />
            </div>

            {items.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No items.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-widest text-slate-400">
                      <th className="py-1 pr-4">Name</th>
                      <th className="py-1 px-4">Status</th>
                      <th className="py-1 px-4">Usage</th>
                      <th className="py-1 pl-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => (
                      <tr key={item.subcategoryId} className={`border-t border-outline-variant/40 ${item.isActive ? "" : "opacity-50"}`}>
                        <td className="py-2 pr-4 text-white font-medium whitespace-nowrap">{item.name}</td>
                        <td className="py-2 px-4 whitespace-nowrap">{item.isActive ? "Active" : "Inactive"}</td>
                        <td className="py-2 px-4">{item.usageCount}</td>
                        <td className="py-2 pl-4 whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <button type="button" disabled={index === 0} onClick={() => void reorder(list, index, -1)} aria-label="Move up" className="rounded px-2 py-1 text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30">↑</button>
                            <button type="button" disabled={index === items.length - 1} onClick={() => void reorder(list, index, 1)} aria-label="Move down" className="rounded px-2 py-1 text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30">↓</button>
                            <button type="button" disabled={busyId === item.subcategoryId} onClick={() => void rename(item)} className="rounded px-2 py-1 text-sky-400 hover:bg-sky-500/10">Rename</button>
                            <button type="button" disabled={busyId === item.subcategoryId} onClick={() => void toggleActive(item)} className="rounded px-2 py-1 text-amber-400 hover:bg-amber-500/10">
                              {item.isActive ? "Deactivate" : "Activate"}
                            </button>
                            {list.key === "material_type" ? (
                              <button type="button" onClick={() => setUnitsFor({ id: item.subcategoryId, name: item.name })} className="rounded px-2 py-1 text-teal-400 hover:bg-teal-500/10">Units</button>
                            ) : null}
                            {mergeSource && mergeSource.listKey === list.key && mergeSource.id !== item.subcategoryId ? (
                              <button type="button" disabled={busyId === item.subcategoryId} onClick={() => void mergeInto(item)} className="rounded px-2 py-1 text-emerald-400 hover:bg-emerald-500/10">→ Merge here</button>
                            ) : mergeSource && mergeSource.id === item.subcategoryId ? (
                              <button type="button" onClick={() => setMergeSource(null)} className="rounded px-2 py-1 text-emerald-400 hover:bg-emerald-500/10">Cancel merge</button>
                            ) : (
                              <button type="button" disabled={busyId === item.subcategoryId} onClick={() => setMergeSource({ id: item.subcategoryId, name: item.name, listKey: list.key })} className="rounded px-2 py-1 text-violet-400 hover:bg-violet-500/10">Merge</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      {unitsFor ? (
        <AllowedUnitsEditor subcategoryId={unitsFor.id} name={unitsFor.name} onClose={() => setUnitsFor(null)} />
      ) : null}
    </div>
  );
}
