"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";

import { RenameModal } from "@/components/catalog/RenameModal";
import { RowActionsMenu, type RowAction } from "@/components/catalog/RowActionsMenu";
import { ToolAddModal } from "@/components/tools/ToolAddModal";
import { ToolCategoryManager } from "@/components/tools/ToolCategoryManager";
import { useToolCategories, useToolMutations, useTools, type ToolDTO } from "@/lib/client/tools";
import { confirmDialog } from "@/lib/ui/confirm";
import { notifyError } from "@/lib/ui/toast";

const SUBTABS = ["Tools", "Categories"] as const;

export function ToolCatalogManager() {
  const [sub, setSub] = useState<(typeof SUBTABS)[number]>("Tools");

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 rounded-lg border border-white/10 bg-slate-950/50 p-1 w-fit">
        {SUBTABS.map((t) => {
          const active = t === sub;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setSub(t)}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
                active
                  ? "bg-blue-600/20 text-blue-400 border border-blue-500/40 shadow-xs"
                  : "text-slate-400 hover:bg-white/5 hover:text-white border border-transparent"
              }`}
            >
              {t}
            </button>
          );
        })}
      </div>
      {sub === "Tools" ? <ToolsTable /> : <ToolCategoryManager />}
    </div>
  );
}

function ToolsTable() {
  const { data: result, mutate, isLoading } = useTools();
  const { data: catResult } = useToolCategories();
  const { patchTool, deleteTool } = useToolMutations();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [renameTarget, setRenameTarget] = useState<ToolDTO | null>(null);

  const tools = result?.ok ? result.data.tools : [];
  const categories = (catResult?.ok ? catResult.data.categories : []).filter((c) => c.isActive);
  const catName = (id: string) => categories.find((c) => c.categoryId === id)?.name ?? "Uncategorized";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tools.filter((t) => {
      if (categoryFilter && t.categoryId !== categoryFilter) return false;
      if (q && !t.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tools, query, categoryFilter]);

  async function submitRename(next: string) {
    if (!renameTarget) return false;
    setBusyId(renameTarget.toolId);
    const res = await patchTool(renameTarget.toolId, { name: next });
    setBusyId(null);
    if (!res.ok) {
      notifyError(res);
      return false;
    }
    toast.success(`Renamed to "${next}"`);
    await mutate();
    return true;
  }

  async function remove(tool: ToolDTO) {
    const confirmed = await confirmDialog({
      title: "Delete Tool",
      message: `Are you sure you want to delete "${tool.name}"? This soft-deletes the tool from your active inventory.`,
      confirmLabel: "Delete Tool",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (!confirmed) return;

    setBusyId(tool.toolId);
    let res = await deleteTool(tool.toolId, false);
    if (!res.ok && res.kind === "api_error" && res.status === 409) {
      const forceConfirmed = await confirmDialog({
        title: "Tool Units Deployed",
        message: `"${tool.name}" currently has units deployed to active sites. Return all deployed units and force-delete anyway?`,
        confirmLabel: "Force Delete",
        cancelLabel: "Cancel",
        tone: "danger",
      });
      if (forceConfirmed) {
        res = await deleteTool(tool.toolId, true);
      } else {
        setBusyId(null);
        return;
      }
    }
    setBusyId(null);
    if (!res.ok) return notifyError(res);
    toast.success(`Deleted "${tool.name}"`);
    await mutate();
  }

  function rowActions(tool: ToolDTO): RowAction[] {
    const busy = busyId === tool.toolId;
    return [
      { label: "Rename", icon: Pencil, tone: "text-sky-400", onSelect: () => setRenameTarget(tool), disabled: busy },
      { label: "Delete", icon: Trash2, tone: "text-red-400", onSelect: () => void remove(tool), disabled: busy },
    ];
  }

  if (isLoading) return <p className="text-sm text-slate-400">Loading tools…</p>;
  if (result && !result.ok) return <p className="text-sm text-rose-400">Failed to load tools.</p>;

  return (
    <div className="space-y-3">
      {/* Toolbar: search / filter / add as one grouped bar. */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-900/60 p-2.5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools by name..."
            className="h-8.5 w-full rounded-lg border border-white/10 bg-slate-900 pl-9 pr-3 text-xs text-white outline-none placeholder-slate-400 focus:border-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-8.5 flex-1 sm:flex-none cursor-pointer rounded-lg border border-white/10 bg-slate-900 px-3 text-xs text-white outline-none focus:border-blue-500"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.categoryId} value={c.categoryId}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex h-8.5 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 text-xs font-bold text-white transition-colors hover:bg-blue-500"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Tool
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        tools.length === 0 ? (
          <EmptyState onAdd={() => setAddOpen(true)} />
        ) : (
          <p className="rounded-xl border border-white/5 bg-slate-900/40 px-4 py-8 text-center text-xs text-slate-500">
            No tools match your search.
          </p>
        )
      ) : (
        <ul className="space-y-2">
          {filtered.map((tool) => (
            <li
              key={tool.toolId}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/80 p-3 shadow-xs transition-all hover:border-white/20"
            >
              {/* Left Content */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Wrench className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-bold text-white">{tool.name}</h3>
                    <span className="shrink-0 rounded-md bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                      {catName(tool.categoryId)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    <span className="whitespace-nowrap rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                      In Godown: {tool.free}
                    </span>
                    <span className="whitespace-nowrap rounded-md bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold text-blue-400 border border-blue-500/20">
                      At Sites: {tool.totalQuantity - tool.free}
                    </span>
                    <span className="whitespace-nowrap text-[10px] font-medium text-slate-400">
                      (Total {tool.totalQuantity})
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Action Menu */}
              <div className="shrink-0">
                <RowActionsMenu actions={rowActions(tool)} label={`Actions for ${tool.name}`} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <ToolAddModal open={addOpen} onClose={() => setAddOpen(false)} categories={categories} onCreated={mutate} />

      <RenameModal
        open={Boolean(renameTarget)}
        noun="Tool"
        currentName={renameTarget?.name ?? ""}
        onClose={() => setRenameTarget(null)}
        onSubmit={submitRename}
      />
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/10 bg-slate-900/40 px-6 py-12 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-full bg-white/5">
        <Wrench className="h-5 w-5 text-slate-400" />
      </div>
      <div>
        <p className="font-bold text-sm text-white">No tools added yet</p>
        <p className="mt-0.5 text-xs text-slate-400">Add your first company tool to start tracking stock.</p>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white transition-colors hover:bg-blue-500"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Tool
      </button>
    </div>
  );
}
