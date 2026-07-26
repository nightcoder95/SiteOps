"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Building2, Info, LayoutGrid, Plus, Search } from "lucide-react";
import { useSWRConfig } from "swr";

import { BySiteView } from "@/components/tools/BySiteView";
import { ToolAddModal } from "@/components/tools/ToolAddModal";
import { ToolDashboardStrip } from "@/components/tools/ToolDashboardStrip";
import { ToolDrawer } from "@/components/tools/ToolDrawer";
import { ToolRow } from "@/components/tools/ToolRow";
import {
  useToolCategories,
  useTools,
  type ToolDTO,
} from "@/lib/client/tools";
import { useApiResult } from "@/lib/http/useApiQuery";

type SiteRow = { siteId: string; name: string };
type ViewTab = "all" | "bySite";

export function ToolsHub() {
  const [query, setQuery] = useState("");
  const [viewTab, setViewTab] = useState<ViewTab>("all");
  const { data: result, isLoading } = useTools(query);
  const { data: catResult } = useToolCategories();
  const { data: siteResult } = useApiResult<SiteRow[]>("/api/sites");

  const { mutate: globalMutate } = useSWRConfig();

  const [drawerTool, setDrawerTool] = useState<ToolDTO | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Revalidate every /api/tools* key (list + KPI dashboard) after a change.
  const revalidateTools = () =>
    globalMutate((key) => typeof key === "string" && key.startsWith("/api/tools"));

  const tools = result?.ok ? result.data.tools : [];
  const categories = catResult?.ok ? catResult.data.categories : [];
  const sites = useMemo(
    () => (siteResult?.ok ? siteResult.data.map((s) => ({ siteId: s.siteId, name: s.name })) : []),
    [siteResult]
  );
  const catName = (id: string) => categories.find((c) => c.categoryId === id)?.name ?? "Uncategorized";

  // Keep drawerTool synced with latest SWR revalidations
  const activeDrawerTool = drawerTool ? (tools.find((t) => t.toolId === drawerTool.toolId) ?? drawerTool) : null;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-5 pb-28">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight text-white">Company Tools</h1>
          <p className="mt-0.5 text-xs leading-snug text-slate-400">
            Godown stock, free pool &amp; site assignments.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-500"
        >
          <Plus className="h-4 w-4" />
          Add Tool
        </button>
      </header>

      <div className="mb-4 space-y-3">
        <ToolDashboardStrip />

        {/* View Tabs & Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {/* Tabs */}
          <div className="flex rounded-lg border border-white/5 bg-white/5 p-0.5">
            <button
              type="button"
              onClick={() => setViewTab("all")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                viewTab === "all"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              All Tools ({tools.length})
            </button>
            <button
              type="button"
              onClick={() => setViewTab("bySite")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                viewTab === "bySite"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              By Site
            </button>
          </div>

          {/* Search */}
          {viewTab === "all" && (
            <div className="relative flex-1 max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tools by name..."
                className="h-8 w-full rounded-lg border border-white/5 bg-white/5 pl-9 pr-3 text-xs text-white placeholder-slate-500 outline-none transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/40"
              />
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {viewTab === "bySite" ? (
        <BySiteView tools={tools} sites={sites} />
      ) : isLoading ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-900" />
          ))}
        </div>
      ) : result && !result.ok ? (
        <p className="text-sm text-rose-400">Failed to load tools inventory.</p>
      ) : tools.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
          <p className="text-sm text-slate-400">
            {query ? "No tools match your search." : "No tools added yet."}
          </p>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="mt-3 inline-block text-xs font-semibold text-blue-400 hover:underline cursor-pointer"
          >
            + Add your first tool →
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {tools.map((tool) => (
            <ToolRow
              key={tool.toolId}
              tool={tool}
              categoryName={catName(tool.categoryId)}
              onManage={() => setDrawerTool(tool)}
            />
          ))}
        </div>
      )}

      {/* Footer info banner */}
      <div className="mt-5 flex items-center gap-2 rounded-lg border border-white/5 bg-slate-950/40 px-3 py-2">
        <Info className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        <p className="min-w-0 flex-1 text-[10px] leading-snug text-slate-400">
          Movements are atomically ledgered. All actions update stock immediately.
        </p>
        <Link
          href="/app/admin/catalog?tab=tools"
          className="inline-flex shrink-0 cursor-pointer items-center gap-0.5 text-[10px] font-semibold text-blue-400 transition-colors hover:text-blue-300"
        >
          Manage Catalog →
        </Link>
      </div>

      {/* Single Tool Drawer */}
      <ToolDrawer
        tool={activeDrawerTool}
        sites={sites}
        categoryName={activeDrawerTool ? catName(activeDrawerTool.categoryId) : ""}
        onClose={() => setDrawerTool(null)}
      />

      {/* Add Tool Modal */}
      <ToolAddModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        categories={categories}
        onCreated={revalidateTools}
      />
    </div>
  );
}
