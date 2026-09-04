"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ArrowDown, ArrowUp, Pause, Pencil, Play, Ruler } from "lucide-react";
import { toast } from "sonner";

import { CatalogAddModal, type CatalogCreateResult } from "@/components/catalog/CatalogAddModal";
import { RenameModal } from "@/components/catalog/RenameModal";
import { RowActionsMenu, type RowAction } from "@/components/catalog/RowActionsMenu";
import { Toggle } from "@/components/ui/Toggle";
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
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);

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

  async function submitRename(next: string) {
    if (!renameTarget) return false;
    const ok = await patch(renameTarget.id, { label: next });
    if (ok) toast.success(`Renamed to "${next}"`);
    return ok;
  }

  async function reorder(units: UnitRow[], index: number, direction: -1 | 1) {
    const a = units[index];
    const b = units[index + direction];
    if (!a || !b) return;
    const aOrder = a.sortOrder;
    const bOrder = b.sortOrder === aOrder ? aOrder + direction : b.sortOrder;
    setBusyId(a.unitId);
    const ok1 = await requestJson(`/api/catalog/units/${a.unitId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sortOrder: bOrder }),
    });
    const ok2 = await requestJson(`/api/catalog/units/${b.unitId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sortOrder: aOrder }),
    });
    setBusyId(null);
    if (!ok1.ok) return notifyError(ok1);
    if (!ok2.ok) return notifyError(ok2);
    await mutate();
  }

  async function checkSimilarity(name: string) {
    const res = await requestJson<{ requiresReview: boolean }>("/api/catalog/units/similar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    return res.ok ? { requiresReview: res.data.requiresReview } : null;
  }

  function makeCreate(category: string) {
    return async ({ name }: { name: string; remark: string | null; override: boolean }): Promise<CatalogCreateResult> => {
      const trimmed = category.trim();
      if (!trimmed) return { status: "error" };
      const res = await requestJson<{ label: string }>("/api/catalog/units", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: name, category: trimmed }),
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

  function buildRowActions(units: UnitRow[], unit: UnitRow, index: number): RowAction[] {
    const busy = busyId === unit.unitId;
    return [
      { label: "Move up", icon: ArrowUp, onSelect: () => void reorder(units, index, -1), disabled: index === 0 },
      { label: "Move down", icon: ArrowDown, onSelect: () => void reorder(units, index, 1), disabled: index === units.length - 1 },
      { label: "Rename", icon: Pencil, tone: "text-sky-400", onSelect: () => setRenameTarget({ id: unit.unitId, name: unit.label }), disabled: busy },
      {
        label: unit.isActive ? "Deactivate" : "Activate",
        icon: unit.isActive ? Pause : Play,
        tone: "text-amber-400",
        onSelect: () => void toggleActive(unit),
        disabled: busy,
      },
    ];
  }

  if (isLoading) return <p className="text-sm text-slate-400">Loading units…</p>;
  if (result && !result.ok) return <p className="text-sm text-rose-400">Failed to load units.</p>;

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/60 p-3">
        <Toggle checked={showInactive} onChange={setShowInactive} label="Show inactive items" />
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="Quantity type (e.g. Weight)"
            className="h-9 w-48 rounded-lg border border-white/10 bg-slate-900 px-3 text-xs text-white outline-none placeholder-slate-400 focus:border-blue-500"
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
        <p className="rounded-xl border border-white/5 bg-slate-900/40 px-4 py-6 text-center text-xs text-slate-500">
          No units added.
        </p>
      ) : (
        groups.map((group) => {
          const units = showInactive ? group.units : group.units.filter((u) => u.isActive);
          if (units.length === 0) return null;
          return (
            <motion.section
              key={group.category}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-bold text-white">{group.category}</h2>
                <CatalogAddModal noun="Unit" onCheckSimilarity={checkSimilarity} onCreate={makeCreate(group.category)} />
              </div>
              <ul className="space-y-2">
                {units.map((unit, index) => (
                  <li
                    key={unit.unitId}
                    className={`flex items-center gap-3.5 rounded-xl border border-white/10 bg-slate-900/80 p-3 shadow-xs transition-all hover:border-white/20 ${
                      unit.isActive ? "" : "opacity-50"
                    }`}
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      <Ruler className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-bold text-white">{unit.label}</h3>
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-semibold border ${
                            unit.isActive
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
                              : "bg-slate-800 text-slate-400 border-slate-700"
                          }`}
                        >
                          {unit.isActive ? "Active" : "Inactive"}
                        </span>
                        <span className="text-[11px] text-slate-400 font-medium">
                          Usage {unit.usageCount}
                        </span>
                      </div>
                    </div>
                    <RowActionsMenu actions={buildRowActions(units, unit, index)} label={`Actions for ${unit.label}`} />
                  </li>
                ))}
              </ul>
            </motion.section>
          );
        })
      )}

      <RenameModal
        open={Boolean(renameTarget)}
        noun="Unit"
        currentName={renameTarget?.name ?? ""}
        onClose={() => setRenameTarget(null)}
        onSubmit={submitRename}
      />
    </div>
  );
}
