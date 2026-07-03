"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Info, Plus, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";

import { ToolAddModal } from "@/components/tools/ToolAddModal";
import { ToolDashboardStrip } from "@/components/tools/ToolDashboardStrip";
import { ToolLedgerDrawer } from "@/components/tools/ToolLedgerDrawer";
import { ToolRow, type ToolDraft } from "@/components/tools/ToolRow";
import {
  useToolCategories,
  useToolMutations,
  useTools,
  type BatchToolPayload,
  type ToolDTO,
} from "@/lib/client/tools";
import { useApiResult } from "@/lib/http/useApiQuery";
import type { InvalidReason, ToolResultStatus } from "@/lib/tools/types";
import { notifyError } from "@/lib/ui/toast";

type SiteRow = { siteId: string; name: string };
type SaveState = { status: ToolResultStatus; reason?: InvalidReason };

function sameAssignments(a: ToolDraft, tool: ToolDTO): boolean {
  if (a.totalQuantity !== tool.totalQuantity) return false;
  if (a.assignments.length !== tool.assignments.length) return false;
  const map = new Map(tool.assignments.map((x) => [x.siteId, x.qty]));
  return a.assignments.every((x) => map.get(x.siteId) === x.qty);
}

export function ToolsHub() {
  const [query, setQuery] = useState("");
  const { data: result, isLoading, mutate } = useTools(query);
  const { data: catResult } = useToolCategories();
  const { data: siteResult } = useApiResult<SiteRow[]>("/api/sites");
  const { saveBatch } = useToolMutations();

  const { mutate: globalMutate } = useSWRConfig();

  const [drafts, setDrafts] = useState<Record<string, ToolDraft>>({});
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [saving, setSaving] = useState(false);
  const [ledgerTool, setLedgerTool] = useState<ToolDTO | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Revalidate every /api/tools* key (list + KPI dashboard) after a create.
  const revalidateTools = () =>
    globalMutate((key) => typeof key === "string" && key.startsWith("/api/tools"));

  const tools = result?.ok ? result.data.tools : [];
  const categories = catResult?.ok ? catResult.data.categories : [];
  const sites = useMemo(() => (siteResult?.ok ? siteResult.data.map((s) => ({ siteId: s.siteId, name: s.name })) : []), [siteResult]);
  const catName = (id: string) => categories.find((c) => c.categoryId === id)?.name ?? "—";
  const siteName = useMemo(() => {
    const map = new Map(sites.map((s) => [s.siteId, s.name]));
    return (id: string) => map.get(id) ?? "Unknown site";
  }, [sites]);

  const draftFor = (tool: ToolDTO): ToolDraft =>
    drafts[tool.toolId] ?? { totalQuantity: tool.totalQuantity, assignments: tool.assignments };

  const dirtyTools = tools.filter((t) => drafts[t.toolId] && !sameAssignments(drafts[t.toolId], t));
  const dirtyCount = dirtyTools.length;

  function updateDraft(toolId: string, next: ToolDraft) {
    setDrafts((d) => ({ ...d, [toolId]: next }));
  }

  async function onSave() {
    if (dirtyCount === 0) return;
    // Client-side invariant gate: block over-assigned tools before the request.
    const overAssigned = dirtyTools.filter((t) => {
      const d = drafts[t.toolId];
      return d.assignments.reduce((s, a) => s + a.qty, 0) > d.totalQuantity;
    });
    if (overAssigned.length > 0) {
      toast.error("Some tools are over-assigned — reduce quantities before saving.");
      return;
    }

    const payload: BatchToolPayload[] = dirtyTools.map((t) => ({
      toolId: t.toolId,
      version: t.version,
      totalQuantity: drafts[t.toolId].totalQuantity,
      assignments: drafts[t.toolId].assignments,
    }));

    setSaving(true);
    const res = await saveBatch(payload);
    setSaving(false);

    if (!res.ok) {
      notifyError(res);
      return;
    }

    const nextStates: Record<string, SaveState> = {};
    const nextDrafts = { ...drafts };
    let okCount = 0;
    for (const r of res.data.results) {
      nextStates[r.toolId] = { status: r.status, reason: r.reason };
      if (r.status === "ok") {
        delete nextDrafts[r.toolId];
        okCount++;
      } else {
        // conflict / invalid → reset draft to fresh server state so the row
        // shows current values, highlighted for review (§6).
        nextDrafts[r.toolId] = { totalQuantity: r.tool.totalQuantity, assignments: r.tool.assignments };
      }
    }
    setDrafts(nextDrafts);
    setSaveStates(nextStates);
    await mutate();

    const conflicts = res.data.results.filter((r) => r.status === "conflict").length;
    const invalids = res.data.results.filter((r) => r.status === "invalid").length;
    if (okCount > 0) toast.success(`Saved ${okCount} tool${okCount === 1 ? "" : "s"}.`);
    if (conflicts > 0) toast.warning(`${conflicts} tool${conflicts === 1 ? "" : "s"} changed by someone else — review.`);
    if (invalids > 0) toast.error(`${invalids} tool${invalids === 1 ? "" : "s"} could not be saved — see details.`);
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold leading-tight text-white">Company Tools</h1>
          <p className="mt-1 max-w-xs text-sm leading-snug text-on-surface-variant">
            Track total stock, warehouse free pool, and per-site deployment.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-500"
        >
          <Plus className="h-4 w-4" />
          Add Tool
        </button>
      </header>

      <div className="mb-5 space-y-4">
        <ToolDashboardStrip />
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or code…"
              className="h-12 w-full rounded-xl border border-white/5 bg-white/5 pl-11 pr-4 text-sm text-on-surface placeholder-slate-600 outline-none transition-all focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/40"
            />
          </div>
          <button
            type="button"
            className="inline-flex h-12 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-white/5 bg-white/5 px-4 text-sm font-medium text-on-surface-variant transition-colors hover:bg-white/10"
          >
            <SlidersHorizontal aria-hidden className="h-4 w-4" />
            Filter
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface-container-low" />
          ))}
        </div>
      ) : result && !result.ok ? (
        <p className="text-sm text-error">Failed to load tools.</p>
      ) : tools.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant p-8 text-center">
          <p className="text-sm text-on-surface-variant">
            {query ? "No tools match your search." : "No tools yet."}
          </p>
          <Link href="/app/admin/catalog?tab=tools" className="mt-2 inline-block text-sm font-semibold text-primary hover:underline">
            Add a tool in the catalog →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {tools.map((tool) => (
            <ToolRow
              key={tool.toolId}
              tool={tool}
              draft={draftFor(tool)}
              sites={sites}
              categoryName={catName(tool.categoryId)}
              dirty={Boolean(drafts[tool.toolId]) && !sameAssignments(draftFor(tool), tool)}
              save={saveStates[tool.toolId] ?? null}
              onChange={(next) => updateDraft(tool.toolId, next)}
              onOpenLedger={() => setLedgerTool(tool)}
            />
          ))}
        </div>
      )}

      {dirtyCount > 0 ? (
        <div className="sticky bottom-4 mt-5 flex items-center justify-between gap-3 rounded-2xl border border-outline bg-surface-container px-4 py-3 shadow-lg">
          <span className="text-sm text-on-surface-variant">
            {dirtyCount} tool{dirtyCount === 1 ? "" : "s"} with unsaved changes
          </span>
          <button
            type="button"
            disabled={saving}
            onClick={() => void onSave()}
            className="cursor-pointer rounded-xl bg-primary px-5 py-2 text-sm font-bold text-on-primary transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      ) : null}

      {/* Footer info banner */}
      <div className="mt-6 flex items-center gap-3 rounded-2xl border border-white/5 bg-surface-container-lowest p-4">
        <Info className="h-5 w-5 shrink-0 text-blue-500" />
        <p className="min-w-0 flex-1 text-xs leading-snug text-on-surface-variant">
          Changes are reflected across all dropdowns. Deactivated items remain in history.
        </p>
        <Link
          href="/app/admin/catalog?tab=tools"
          className="inline-flex shrink-0 cursor-pointer items-center gap-0.5 text-xs font-semibold text-blue-500 transition-colors hover:text-blue-400"
        >
          Learn more →
        </Link>
      </div>

      <ToolLedgerDrawer
        toolId={ledgerTool?.toolId ?? null}
        toolName={ledgerTool?.name ?? ""}
        onClose={() => setLedgerTool(null)}
        siteName={siteName}
      />

      <ToolAddModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        categories={categories}
        onCreated={revalidateTools}
      />
    </div>
  );
}
