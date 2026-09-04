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

export function CatalogManager() {
  const { data: result, mutate, isLoading } = useApiResult<OverviewResponse>("/api/admin/catalog");
  const [activeOperation, setActiveOperation] = useState(0);
  const [showInactive, setShowInactive] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string; noun: string } | null>(null);
  const [mergeState, setMergeState] = useState<{ source: CatalogItem; list: CatalogOverviewList } | null>(null);
  const [unitsFor, setUnitsFor] = useState<{ id: string; name: string } | null>(null);

  const operations = result?.ok ? result.data.operations : [];
  const current = operations[activeOperation];
  const firstList = current?.lists[0];
  const singleListNoun = current?.lists.length === 1 ? firstList?.noun : null;

  // Apply a change to the cached overview without refetching. `revalidate: false`
  // is deliberate: the server response for these PATCHes carries no information
  // the client does not already have, and the underlying aggregate is a full
  // scan of every entry table.
  async function applyLocal(update: (ops: CatalogOverviewOperation[]) => CatalogOverviewOperation[]) {
    await mutate(
      (current) =>
        current && current.ok
          ? { ...current, data: { ...current.data, operations: update(current.data.operations) } }
          : current,
      { revalidate: false },
    );
  }

  // Map every item in every list through `fn`, preserving structure.
  function mapItems(
    ops: CatalogOverviewOperation[],
    fn: (item: CatalogItem) => CatalogItem,
  ): CatalogOverviewOperation[] {
    return ops.map((op) => ({
      ...op,
      lists: op.lists.map((l) => ({ ...l, items: l.items.map(fn) })),
    }));
  }

  async function toggleActive(item: CatalogItem) {
    const nextActive = !item.isActive;
    // Optimistic flip first so the row responds instantly on a slow site link.
    await applyLocal((ops) =>
      mapItems(ops, (i) => (i.subcategoryId === item.subcategoryId ? { ...i, isActive: nextActive } : i)),
    );

    setBusyId(item.subcategoryId);
    const res = await requestJson(`/api/forms/subcategories/${item.subcategoryId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: nextActive }),
    });
    setBusyId(null);

    if (!res.ok) {
      notifyError(res);
      // Roll back by revalidating — the server is the truth and we just learned
      // our optimistic guess was wrong.
      await mutate();
      return;
    }
    toast.success(`${item.isActive ? "Deactivated" : "Activated"} "${item.name}"`);
  }

  async function submitRename(next: string) {
    if (!renameTarget) return false;
    const target = renameTarget;
    await applyLocal((ops) =>
      mapItems(ops, (i) => (i.subcategoryId === target.id ? { ...i, name: next } : i)),
    );

    setBusyId(target.id);
    const res = await requestJson(`/api/forms/subcategories/${target.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: next }),
    });
    setBusyId(null);

    if (!res.ok) {
      notifyError(res);
      await mutate();
      return false;
    }
    toast.success(`Renamed to "${next}"`);
    return true;
  }

  async function reorder(list: CatalogOverviewList, index: number, direction: -1 | 1) {
    const a = list.items[index];
    const b = list.items[index + direction];
    if (!a || !b) return;
    const aOrder = a.sortOrder;
    const bOrder = b.sortOrder === aOrder ? aOrder + direction : b.sortOrder;

    await applyLocal((ops) =>
      ops.map((op) => ({
        ...op,
        lists: op.lists.map((l) =>
          l.key !== list.key
            ? l
            : {
                ...l,
                items: l.items
                  .map((i) =>
                    i.subcategoryId === a.subcategoryId
                      ? { ...i, sortOrder: bOrder }
                      : i.subcategoryId === b.subcategoryId
                        ? { ...i, sortOrder: aOrder }
                        : i,
                  )
                  // Mirrors buildCatalogOverview's ordering exactly, so the row
                  // does not jump on the next revalidation.
                  .sort((x, y) => x.sortOrder - y.sortOrder || x.name.localeCompare(y.name)),
              },
        ),
      })),
    );

    setBusyId(a.subcategoryId);
    // Parallel, not sequential: one arrow tap used to cost three round-trips.
    const [ok1, ok2] = await Promise.all([
      requestJson(`/api/forms/subcategories/${a.subcategoryId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sortOrder: bOrder }),
      }),
      requestJson(`/api/forms/subcategories/${b.subcategoryId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sortOrder: aOrder }),
      }),
    ]);
    setBusyId(null);

    // Partial failure leaves the two rows inconsistent — revalidate so the UI
    // shows what the database actually holds rather than our optimistic guess.
    if (!ok1.ok || !ok2.ok) {
      notifyError(ok1.ok ? ok2 : ok1);
      await mutate();
    }
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
    // Full revalidate: a merge moves usage counts between rows — the client has
    // no way to compute the resulting counts.
    await mutate();
    return true;
  }

  function makeCheckSimilarity(categoryId: string | null) {
    return async (name: string) => {
      if (!categoryId) return null;
      const res = await requestJson<{ requiresReview: boolean }>("/api/forms/subcategories/similar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, categoryId }),
      });
      return res.ok ? { requiresReview: res.data.requiresReview } : null;
    };
  }

  function makeCreate(categoryId: string | null, noun: string) {
    return async ({
      name,
      remark,
      override,
    }: {
      name: string;
      remark: string | null;
      override: boolean;
    }): Promise<CatalogCreateResult> => {
      if (!categoryId) return { status: "error" };
      const res = await requestJson<{ name: string }>("/api/forms/subcategories", {
        method: "POST",
        headers: { "content-type": "application/json" },
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
      // Full revalidate: the server assigns the id and may return a
      // review-pending state we cannot predict client-side.
      await mutate();
      return { status: "created" };
    };
  }

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

  // Skeleton rather than a bare "Loading…" string: the loaded view is a chip
  // row, a toolbar and a list, so a one-line placeholder collapsed the page and
  // then jumped when the data arrived. Heights mirror the real elements
  // (chips ~34px, toolbar ~58px, rows ~56px).
  if (isLoading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading operations catalog">
        <div className="flex flex-wrap gap-2 pb-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[34px] w-28 animate-pulse rounded-lg bg-slate-900" />
          ))}
        </div>
        <div className="h-[58px] animate-pulse rounded-xl border border-white/10 bg-slate-900/60" />
        <div className="space-y-2.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-900" />
          ))}
        </div>
      </div>
    );
  }
  if (result && !result.ok) return <p className="text-sm text-rose-400">Failed to load catalog.</p>;

  const mergeCandidates: MergeCandidate[] = mergeState
    ? mergeState.list.items
        .filter((i) => i.subcategoryId !== mergeState.source.subcategoryId && i.isActive)
        .map((i) => ({ id: i.subcategoryId, name: i.name, usageCount: i.usageCount }))
    : [];

  return (
    <div className="space-y-5">
      {/* Operation category chips */}
      <div className="flex flex-wrap gap-2 overflow-x-auto pb-1">
        {operations.map((op, i) => {
          const Icon = OPERATION_ICONS[op.operation] ?? Boxes;
          const active = i === activeOperation;
          return (
            <button
              key={op.operation}
              type="button"
              onClick={() => setActiveOperation(i)}
              className={`flex cursor-pointer items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
                active
                  ? "bg-blue-600/20 text-blue-400 border border-blue-500/40 shadow-xs"
                  : "border border-white/5 bg-slate-900/60 text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {op.operation}
            </button>
          );
        })}
      </div>

      {/* Toolbar: Toggle + primary add */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/60 p-3">
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

      {/* Item Lists */}
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
              <h2 className="text-base font-bold text-white">{list.noun}</h2>
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
              <p className="rounded-xl border border-white/5 bg-slate-900/40 px-4 py-6 text-center text-xs text-slate-500">
                No items added.
              </p>
            ) : (
              <ul className="space-y-2">
                {items.map((item, index) => (
                  <li
                    key={item.subcategoryId}
                    className={`flex items-center gap-3.5 rounded-xl border border-white/10 bg-slate-900/80 p-3 shadow-xs transition-all hover:border-white/20 ${
                      item.isActive ? "" : "opacity-50"
                    }`}
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      <RowIcon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-bold text-white">{item.name}</h3>
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-semibold border ${
                            item.isActive
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
                              : "bg-slate-800 text-slate-400 border-slate-700"
                          }`}
                        >
                          {item.isActive ? "Active" : "Inactive"}
                        </span>
                        <span className="text-[11px] text-slate-400 font-medium">
                          Usage {item.usageCount}
                        </span>
                      </div>
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
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/50 p-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
          <Info className="h-4 w-4" />
        </span>
        <p className="flex-1 text-xs leading-relaxed text-slate-400">
          Changes are reflected across all dropdowns. Deactivated items remain in history.
        </p>
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
