"use client";

import { ArrowRightLeft, Building2, Package } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { SiteOption } from "@/components/tools/AssignmentPanel";
import type { ToolDTO } from "@/lib/client/tools";
import { useToolMutations } from "@/lib/client/tools";
import { notifyError } from "@/lib/ui/toast";

export function BySiteView({
  tools,
  sites,
}: {
  tools: ToolDTO[];
  sites: SiteOption[];
}) {
  const { moveTool } = useToolMutations();
  const [returning, setReturning] = useState<string | null>(null);

  const siteMap = new Map(sites.map((s) => [s.siteId, s.name]));

  // Client-side grouping: siteId -> array of { tool, qty }
  const siteAssignmentsMap = new Map<string, { tool: ToolDTO; qty: number }[]>();

  for (const tool of tools) {
    for (const a of tool.assignments) {
      if (a.qty > 0) {
        const list = siteAssignmentsMap.get(a.siteId) ?? [];
        list.push({ tool, qty: a.qty });
        siteAssignmentsMap.set(a.siteId, list);
      }
    }
  }

  async function handleQuickReturn(toolId: string, toolName: string, siteId: string, siteName: string, qty: number) {
    const key = `${toolId}-${siteId}`;
    setReturning(key);
    const res = await moveTool(toolId, {
      kind: "return_to_godown",
      fromSiteId: siteId,
      quantity: qty,
      note: "Brought back via By Site view",
    });
    setReturning(null);

    if (!res.ok) {
      notifyError(res);
      return;
    }
    toast.success(`Brought back ${qty} ${toolName} from ${siteName} to Godown.`);
  }

  const siteEntries = Array.from(siteAssignmentsMap.entries());

  if (siteEntries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
        <Building2 className="mx-auto h-8 w-8 text-slate-500 mb-2" />
        <p className="text-sm text-slate-400">No tools are currently assigned to any site.</p>
        <p className="mt-1 text-xs text-slate-500">All tools are in the Godown.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {siteEntries.map(([siteId, items]) => {
        const name = siteMap.get(siteId) ?? "Unknown Site";
        const totalItemsAtSite = items.reduce((s, i) => s + i.qty, 0);

        return (
          <div key={siteId} className="rounded-xl border border-white/5 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-400" />
                <h3 className="text-sm font-bold text-white">{name}</h3>
              </div>
              <span className="rounded-md bg-blue-500/15 px-2.5 py-0.5 text-xs font-semibold text-blue-400">
                {totalItemsAtSite} tool{totalItemsAtSite === 1 ? "" : "s"} assigned
              </span>
            </div>

            <div className="space-y-2">
              {items.map(({ tool, qty }) => {
                const returnKey = `${tool.toolId}-${siteId}`;
                const isSubmitting = returning === returnKey;

                return (
                  <div
                    key={tool.toolId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/5 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Package className="h-4 w-4 text-slate-400 shrink-0" />
                      <span className="truncate text-xs font-semibold text-white">{tool.name}</span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-bold text-white tabular-nums">×{qty}</span>
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => void handleQuickReturn(tool.toolId, tool.name, siteId, name, qty)}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:opacity-40"
                      >
                        <ArrowRightLeft className="h-3 w-3" />
                        {isSubmitting ? "Returning..." : "Bring Back All"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
