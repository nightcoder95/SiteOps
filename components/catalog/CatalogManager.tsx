"use client";

import { useState } from "react";
import { motion } from "motion/react";
import {
  ArrowDown,
  ArrowUp,
  Boxes,
  ChevronRight,
  CircleDollarSign,
  Combine,
  Hammer,
  Info,
  Layers,
  Package,
  Pause,
  Pencil,
  Play,
  Ruler,
  ShieldAlert,
  ShieldCheck,
  Truck,
  TriangleAlert,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { AllowedUnitsEditor } from "@/components/catalog/AllowedUnitsEditor";
import { CatalogAddModal, type CatalogCreateResult } from "@/components/catalog/CatalogAddModal";
import { MergeModal, type MergeCandidate } from "@/components/catalog/MergeModal";
import { RenameModal } from "@/components/catalog/RenameModal";
import { RowActionsMenu, type RowAction } from "@/components/catalog/RowActionsMenu";
import { Toggle } from "@/components/ui/Toggle";
import type { CatalogOverviewList, CatalogOverviewOperation } from "@/lib/catalog/overview";
import { requestJson } from "@/lib/http/client";
import { useApiResult } from "@/lib/http/useApiQuery";
import { notifyError } from "@/lib/ui/toast";

type OverviewResponse = { operations: CatalogOverviewOperation[] };

type SimilarCandidate = { id: string; name: string; score: number; band: "high" | "medium" };

type CatalogItem = CatalogOverviewList["items"][number];

// Icon per operation tab (matches the sub-tab chips in the design).
const OPERATION_ICONS: Record<string, LucideIcon> = {
  Labour: Users,
  Materials: Package,
  Equipment: Truck,
  Expenses: CircleDollarSign,
  Incident: ShieldCheck,
};

// Icon per managed list, used for the leading row tile.
const LIST_ICONS: Record<string, LucideIcon> = {
  work_type: Hammer,
  material_type: Package,
  work_stage: Layers,
  equipment_type: Truck,
  expense_category: CircleDollarSign,
  incident_type: ShieldAlert,
  severity: TriangleAlert,
};

// Saturated circle colours cycled per row (deterministic by id).
const TILE_COLORS = [
  "bg-sky-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-cyan-500",
] as const;

function tileColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return TILE_COLORS[Math.abs(hash) % TILE_COLORS.length];
}

export function CatalogManager() {
  const { data: result, mutate, isLoading } = useApiResult<OverviewResponse>("/api/admin/catalog");
  const [activeOperation, setActiveOperation] = useState(0);
  const [showInactive, setShowInactive] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Rename + merge now run through dedicated modals instead of window prompts.
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string; noun: string } | null>(null);
  const [mergeState, setMergeState] = useState<{ source: CatalogItem; list: CatalogOverviewList } | null>(null);
  // Allowed-units editor target (material subcategory rows only).
  const [unitsFor, setUnitsFor] = useState<{ id: string; name: string } | null>(null);

  const operations = result?.ok ? result.data.operations : [];
  const current = operations[activeOperation];
  // Single-list operations (e.g. Labour → Work Type) hoist their Add button up
  // onto the toggle row, matching the catalog reference layout.
  const firstList = current?.lists[0];
  const singleListNoun = current?.lists.length === 1 ? firstList?.noun : null;

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

  async function toggleActive(item: CatalogItem) {
    if (await patch(item.subcategoryId, { isActive: !item.isActive })) {
      toast.success(`${item.isActive ? "Deactivated" : "Activated"} "${item.name}"`);
    }
  }

  async function submitRename(next: string) {
    if (!renameTarget) return false;
    const ok = await patch(renameTarget.id, { name: next });
    if (ok) toast.success(`Renamed to "${next}"`);
    return ok;
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

  async function submitMerge(targetId: string) {
    if (!mergeState) return false;
    setBusyId(targetId);
    const res = await requestJson("/api/admin/catalog/merge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceId: mergeState.source.subcategoryId, targetId }),
    });
    setBusyId(null);
    if (!res.ok) {
      notifyError(res);
      return false;
    }
    const targetName = mergeState.list.items.find((i) => i.subcategoryId === targetId)?.name ?? "target";
    toast.success(`Merged "${mergeState.source.name}" into "${targetName}"`);
    await mutate();
    return true;
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

  // Single source of truth for a row's actions.
  function buildRowActions(list: CatalogOverviewList, item: CatalogItem, index: number, count: number): RowAction[] {
    const busy = busyId === item.subcategoryId;
    const actions: RowAction[] = [
      { label: "Move up", icon: ArrowUp, onSelect: () => void reorder(list, index, -1), disabled: index === 0 },
      { label: "Move down", icon: ArrowDown, onSelect: () => void reorder(list, index, 1), disabled: index === count - 1 },
      { label: "Rename", icon: Pencil, tone: "text-sky-400", onSelect: () => setRenameTarget({ id: item.subcategoryId, name: item.name, noun: list.noun }), disabled: busy },
      {
        label: item.isActive ? "Deactivate" : "Activate",
        icon: item.isActive ? Pause : Play,
        tone: "text-amber-400",
        onSelect: () => void toggleActive(item),
        disabled: busy,
      },
    ];
    if (list.key === "material_type") {
      actions.push({
        label: "Units",
        icon: Ruler,
        tone: "text-teal-400",
        onSelect: () => setUnitsFor({ id: item.subcategoryId, name: item.name }),
      });
    }
    actions.push({
      label: "Merge",
      icon: Combine,
      tone: "text-violet-400",
      onSelect: () => setMergeState({ source: item, list }),
      disabled: busy,
    });
    return actions;
  }

  if (isLoading) return <p className="text-sm text-slate-400">Loading catalog…</p>;
  if (result && !result.ok) return <p className="text-sm text-red-400">Failed to load catalog.</p>;

  // Candidates for the open merge modal: same list, active, self excluded.
  const mergeCandidates: MergeCandidate[] = mergeState
    ? mergeState.list.items
        .filter((i) => i.subcategoryId !== mergeState.source.subcategoryId && i.isActive)
        .map((i) => ({ id: i.subcategoryId, name: i.name, usageCount: i.usageCount }))
    : [];

  return (
    <div className="space-y-6">
      {/* Operation chips */}
      <div className="flex flex-wrap gap-2.5">
        {operations.map((op, i) => {
          const Icon = OPERATION_ICONS[op.operation] ?? Boxes;
          const active = i === activeOperation;
          return (
            <button
              key={op.operation}
              type="button"
              onClick={() => setActiveOperation(i)}
              className={`flex cursor-pointer items-center gap-2.5 rounded-2xl px-5 py-3 text-[15px] font-bold tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 ${
                active
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                  : "border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {op.operation}
            </button>
          );
        })}
      </div>

      {/* Toggle + primary add: on one row when the operation has a single list. */}
      <div className="flex items-center justify-between gap-3">
        <Toggle checked={showInactive} onChange={setShowInactive} label="Show inactive items" />
        {singleListNoun ? (
          <CatalogAddModal
            noun={firstList!.noun}
            solid
            disabled={!firstList!.categoryId}
            withRemark
            onCheckSimilarity={makeCheckSimilarity(firstList!.categoryId)}
            onCreate={makeCreate(firstList!.categoryId, firstList!.noun)}
          />
        ) : null}
      </div>

      {/* Lists */}
      {current?.lists.map((list) => {
        const items = showInactive ? list.items : list.items.filter((i) => i.isActive);
        const RowIcon = LIST_ICONS[list.key] ?? Boxes;
        return (
          <motion.section
            key={list.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-2xl font-extrabold text-white">{list.noun}</h2>
              {singleListNoun ? null : (
                <CatalogAddModal
                  noun={list.noun}
                  solid
                  disabled={!list.categoryId}
                  withRemark
                  onCheckSimilarity={makeCheckSimilarity(list.categoryId)}
                  onCreate={makeCreate(list.categoryId, list.noun)}
                />
              )}
            </div>

            {items.length === 0 ? (
              <p className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-8 text-center text-sm text-slate-500">
                No items.
              </p>
            ) : (
              <ul className="space-y-3">
                {items.map((item, index) => (
                  <li
                    key={item.subcategoryId}
                    className={`flex items-center gap-4 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-4 transition-colors ${
                      item.isActive ? "" : "opacity-50"
                    }`}
                  >
                    <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-white ${tileColor(item.subcategoryId)}`}>
                      <RowIcon className="h-6 w-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-bold text-white">{item.name}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-[13px] text-slate-500">
                        <span
                          aria-hidden
                          className={`inline-block h-1.5 w-1.5 rounded-full ${item.isActive ? "bg-emerald-400" : "bg-slate-500"}`}
                        />
                        <span className={item.isActive ? "text-emerald-400" : "text-slate-500"}>
                          {item.isActive ? "Active" : "Inactive"}
                        </span>
                        <span aria-hidden className="text-slate-700">•</span>
                        Usage {item.usageCount}
                      </p>
                    </div>
                    <RowActionsMenu
                      actions={buildRowActions(list, item, index, items.length)}
                      label={`Actions for ${item.name}`}
                    />
                  </li>
                ))}
              </ul>
            )}
          </motion.section>
        );
      })}

      {/* Info footer */}
      <div className="card-standard flex items-center gap-4 p-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/5 text-slate-400 ring-1 ring-white/10">
          <Info className="h-5 w-5" />
        </span>
        <p className="flex-1 text-[13px] leading-relaxed text-slate-400">
          Changes are reflected across all dropdowns.
          <br className="hidden sm:block" /> Deactivated items remain in history.
        </p>
        <a
          href="/app/admin/catalog"
          className="inline-flex shrink-0 items-center gap-1 text-[13px] font-bold text-sky-400 transition-colors hover:text-sky-300"
        >
          Learn more
          <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
        </a>
      </div>

      <RenameModal
        open={Boolean(renameTarget)}
        noun={renameTarget?.noun ?? "Item"}
        currentName={renameTarget?.name ?? ""}
        onClose={() => setRenameTarget(null)}
        onSubmit={submitRename}
      />

      <MergeModal
        open={Boolean(mergeState)}
        sourceName={mergeState?.source.name ?? ""}
        candidates={mergeCandidates}
        onClose={() => setMergeState(null)}
        onMerge={submitMerge}
      />

      {unitsFor ? (
        <AllowedUnitsEditor subcategoryId={unitsFor.id} name={unitsFor.name} onClose={() => setUnitsFor(null)} />
      ) : null}
    </div>
  );
}
