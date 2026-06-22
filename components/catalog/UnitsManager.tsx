"use client";

import { useState } from "react";
import { toast } from "sonner";

import { CatalogAddModal, type CatalogCreateResult } from "@/components/catalog/CatalogAddModal";
import type { UnitGroup, UnitRow } from "@/lib/catalog/units";
import { requestJson } from "@/lib/http/client";
import { useApiResult } from "@/lib/http/useApiQuery";
import { notifyError } from "@/lib/ui/toast";

type UnitsResponse = { groups: UnitGroup[] };

export function UnitsManager() {
  const { data: result, mutate, isLoading } = useApiResult<UnitsResponse>("/api/catalog/units");
  const [showInactive, setShowInactive] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState("");

  const groups = result?.ok ? result.data.groups : [];

  async function patch(unitId: string, body: Record<string, unknown>) {
    setBusyId(unitId);
    const res = await requestJson(`/api/catalog/units/${unitId}`, {
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

  async function toggleActive(unit: UnitRow) {
    if (await patch(unit.unitId, { isActive: !unit.isActive })) {
      toast.success(`${unit.isActive ? "Deactivated" : "Activated"} "${unit.label}"`);
    }
  }

  async function rename(unit: UnitRow) {
    const next = window.prompt(`Rename "${unit.label}" to:`, unit.label)?.trim();
    if (!next || next === unit.label) return;
    if (await patch(unit.unitId, { label: next })) {
      toast.success(`Renamed to "${next}"`);
    }
  }

  async function reorder(units: UnitRow[], index: number, direction: -1 | 1) {
    const a = units[index];
    const b = units[index + direction];
    if (!a || !b) return;
    const aOrder = a.sortOrder;
    const bOrder = b.sortOrder === aOrder ? aOrder + direction : b.sortOrder;
    setBusyId(a.unitId);
    const ok1 = await requestJson(`/api/catalog/units/${a.unitId}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ sortOrder: bOrder }),
    });
    const ok2 = await requestJson(`/api/catalog/units/${b.unitId}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ sortOrder: aOrder }),
    });
    setBusyId(null);
    if (!ok1.ok) return notifyError(ok1);
    if (!ok2.ok) return notifyError(ok2);
    await mutate();
  }

  async function checkSimilarity(name: string) {
    const res = await requestJson<{ requiresReview: boolean }>("/api/catalog/units/similar", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }),
    });
    return res.ok ? { requiresReview: res.data.requiresReview } : null;
  }

  function makeCreate(category: string) {
    return async ({ name }: { name: string; remark: string | null; override: boolean }): Promise<CatalogCreateResult> => {
      const trimmed = category.trim();
      if (!trimmed) return { status: "error" };
      const res = await requestJson<{ label: string }>("/api/catalog/units", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label: name, category: trimmed }),
      });
      if (!res.ok) {
        notifyError(res);
        return { status: "error" };
      }
      toast.success(`Added unit "${res.data.label}"`);
      setNewCategory("");
      await mutate();
      return { status: "created" };
    };
  }

  if (isLoading) return <p className="text-sm text-on-surface-variant">Loading units…</p>;
  if (result && !result.ok) return <p className="text-sm text-error">Failed to load units.</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs font-semibold uppercase text-on-surface-variant">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="Quantity type (e.g. Weight)"
            className="h-9 w-48 rounded-xl border border-outline px-3 text-sm"
          />
          <CatalogAddModal
            noun="Unit"
            disabled={!newCategory.trim()}
            onCheckSimilarity={checkSimilarity}
            onCreate={makeCreate(newCategory)}
          />
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-on-surface-variant">No units yet.</p>
      ) : (
        groups.map((group) => {
          const units = showInactive ? group.units : group.units.filter((u) => u.isActive);
          if (units.length === 0) return null;
          return (
            <section key={group.category} className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-extrabold text-white">{group.category}</h2>
                <CatalogAddModal
                  noun="Unit"
                  onCheckSimilarity={checkSimilarity}
                  onCreate={makeCreate(group.category)}
                />
              </div>
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
                    {units.map((unit, index) => (
                      <tr key={unit.unitId} className={`border-t border-outline-variant/40 ${unit.isActive ? "" : "opacity-50"}`}>
                        <td className="py-2 pr-4 text-white font-medium whitespace-nowrap">{unit.label}</td>
                        <td className="py-2 px-4 whitespace-nowrap">{unit.isActive ? "Active" : "Inactive"}</td>
                        <td className="py-2 px-4">{unit.usageCount}</td>
                        <td className="py-2 pl-4 whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <button type="button" disabled={index === 0} onClick={() => void reorder(units, index, -1)} aria-label="Move up" className="rounded px-2 py-1 text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30">↑</button>
                            <button type="button" disabled={index === units.length - 1} onClick={() => void reorder(units, index, 1)} aria-label="Move down" className="rounded px-2 py-1 text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30">↓</button>
                            <button type="button" disabled={busyId === unit.unitId} onClick={() => void rename(unit)} className="rounded px-2 py-1 text-sky-400 hover:bg-sky-500/10">Rename</button>
                            <button type="button" disabled={busyId === unit.unitId} onClick={() => void toggleActive(unit)} className="rounded px-2 py-1 text-amber-400 hover:bg-amber-500/10">
                              {unit.isActive ? "Deactivate" : "Activate"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
