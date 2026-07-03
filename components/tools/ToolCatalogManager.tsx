"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";

import { RenameModal } from "@/components/catalog/RenameModal";
import { RowActionsMenu, type RowAction } from "@/components/catalog/RowActionsMenu";
import { ToolAddModal } from "@/components/tools/ToolAddModal";
import { ToolCategoryManager } from "@/components/tools/ToolCategoryManager";
import { useToolCategories, useToolMutations, useTools, type ToolDTO } from "@/lib/client/tools";
import { notifyError } from "@/lib/ui/toast";

const SUBTABS = ["Tools", "Categories"] as const;

const TILE_COLORS = ["bg-sky-500", "bg-violet-500", "bg-amber-500", "bg-emerald-500", "bg-rose-500", "bg-cyan-500"] as const;
function tileColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return TILE_COLORS[Math.abs(hash) % TILE_COLORS.length];
}

export function ToolCatalogManager() {
  const [sub, setSub] = useState<(typeof SUBTABS)[number]>("Tools");

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        {SUBTABS.map((t) => {
          const active = t === sub;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setSub(t)}
              className={`cursor-pointer rounded-full px-5 py-2.5 text-[13px] font-bold uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 ${
                active
                  ? "bg-sky-500 text-slate-950"
                  : "border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
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
  const catName = (id: string) => categories.find((c) => c.categoryId === id)?.name ?? "—";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tools.filter((t) => {
      if (categoryFilter && t.categoryId !== categoryFilter) return false;
      if (q && !t.name.toLowerCase().includes(q) && !t.code.toLowerCase().includes(q)) return false;
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
    if (!window.confirm(`Delete "${tool.name}"? This soft-deletes the tool.`)) return;
    setBusyId(tool.toolId);
    let res = await deleteTool(tool.toolId, false);
    // 409 = units deployed; offer force-return path (case 7).
    if (!res.ok && res.kind === "api_error" && res.status === 409) {
      if (window.confirm(`"${tool.name}" has units deployed to sites. Return them all and delete anyway?`)) {
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
  if (result && !result.ok) return <p className="text-sm text-red-400">Failed to load tools.</p>;

  return (
    <div className="space-y-4">
      {/* Toolbar: search / filter / add as one grouped bar. */}
      <div className="card-standard flex flex-wrap items-center gap-2 p-2">
        <div className="relative min-w-[10rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools…"
            className="h-10 w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 text-sm text-white outline-none placeholder-slate-600 focus:ring-2 focus:ring-sky-500/50"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-10 min-w-[8rem] flex-1 cursor-pointer rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:ring-2 focus:ring-sky-500/50 sm:flex-none"
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
          className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-sky-500 px-4 text-sm font-bold text-slate-950 transition-colors hover:bg-sky-400"
        >
          <Plus className="h-4 w-4" />
          Add tool
        </button>
      </div>

      {filtered.length === 0 ? (
        tools.length === 0 ? (
          <EmptyState onAdd={() => setAddOpen(true)} />
        ) : (
          <p className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-10 text-center text-sm text-slate-500">
            No tools match your search.
          </p>
        )
      ) : (
        <ul className="space-y-3">
          {filtered.map((tool) => (
            <li
              key={tool.toolId}
              className="flex items-center gap-4 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-4"
            >
              <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-white ${tileColor(tool.toolId)}`}>
                <Wrench className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-base font-bold text-white">{tool.name}</p>
                  <span className="shrink-0 rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-slate-400">
                    {tool.code}
                  </span>
                </div>
                <p className="mt-1 flex items-center gap-3 text-[13px] text-slate-500">
                  <span>{catName(tool.categoryId)}</span>
                  <span aria-hidden className="text-slate-700">•</span>
                  <span className="tabular-nums">Total {tool.totalQuantity}</span>
                  <StockPill free={tool.free} total={tool.totalQuantity} />
                </p>
              </div>
              <RowActionsMenu actions={rowActions(tool)} label={`Actions for ${tool.name}`} />
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

// Free/total as a small bar + count, so stock reads at a glance.
function StockPill({ free, total }: { free: number; total: number }) {
  const pct = total > 0 ? Math.round((free / total) * 100) : 0;
  const tone = free === 0 ? "bg-amber-400/70" : "bg-emerald-400/70";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-white/5">
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular-nums text-slate-500">{free} free</span>
    </span>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-14 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-white/5">
        <Wrench className="h-6 w-6 text-slate-400" />
      </div>
      <div>
        <p className="font-bold text-white">No tools yet</p>
        <p className="mt-1 text-sm text-slate-400">Add your first company tool to start tracking stock.</p>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl bg-sky-500 px-4 text-sm font-bold text-slate-950 transition-colors hover:bg-sky-400"
      >
        <Plus className="h-4 w-4" />
        Add tool
      </button>
    </div>
  );
}
