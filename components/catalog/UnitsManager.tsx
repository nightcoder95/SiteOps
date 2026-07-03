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

const TILE_COLORS = ["bg-sky-500", "bg-violet-500", "bg-amber-500", "bg-emerald-500", "bg-rose-500", "bg-cyan-500"] as const;
function tileColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return TILE_COLORS[Math.abs(hash) % TILE_COLORS.length];
}

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
  if (result && !result.ok) return <p className="text-sm text-red-400">Failed to load units.</p>;

  return (
    <div className="space-y-6">
      {/* Toolbar: show-inactive toggle + new quantity-type category */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Toggle checked={showInactive} onChange={setShowInactive} label="Show inactive items" />
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="Quantity type (e.g. Weight)"
            className="h-10 w-48 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder-slate-600 focus:ring-2 focus:ring-sky-500/50"
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
        <p className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-8 text-center text-sm text-slate-500">
          No units yet.
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
              className="card-standard p-5 sm:p-6"
            >
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2 className="text-2xl font-extrabold text-white">{group.category}</h2>
                <CatalogAddModal noun="Unit" onCheckSimilarity={checkSimilarity} onCreate={makeCreate(group.category)} />
              </div>
              <ul className="space-y-3">
                {units.map((unit, index) => (
                  <li
                    key={unit.unitId}
                    className={`flex items-center gap-4 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-4 ${unit.isActive ? "" : "opacity-50"}`}
                  >
                    <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-white ${tileColor(unit.unitId)}`}>
                      <Ruler className="h-6 w-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-bold text-white">{unit.label}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-[13px] text-slate-500">
                        <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${unit.isActive ? "bg-emerald-400" : "bg-slate-500"}`} />
                        <span className={unit.isActive ? "text-emerald-400" : "text-slate-500"}>{unit.isActive ? "Active" : "Inactive"}</span>
                        <span aria-hidden className="text-slate-700">•</span>
                        Usage {unit.usageCount}
                      </p>
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
