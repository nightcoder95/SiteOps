"use client";

import { Sliders } from "lucide-react";
import type { ToolDTO } from "@/lib/client/tools";

export function ToolRow({
  tool,
  categoryName,
  onManage,
}: {
  tool: ToolDTO;
  categoryName: string;
  onManage: () => void;
}) {
  const inGodown = tool.free;
  const assigned = tool.assignments.reduce((s, a) => s + a.qty, 0);

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/80 p-3.5 shadow-sm transition-all hover:border-white/20">
      {/* Top Row: Tool Name + Category & Manage Action */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold leading-tight text-white break-words">
            {tool.name}
          </h3>
          <span className="mt-1 inline-block rounded-md bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-400 border border-white/5">
            {categoryName}
          </span>
        </div>

        <button
          type="button"
          onClick={onManage}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-bold text-blue-400 transition-colors hover:bg-blue-500/20 active:scale-95"
        >
          <Sliders className="h-3.5 w-3.5" />
          Manage
        </button>
      </div>

      {/* Bottom Row: Non-wrapping Status Badges */}
      <div className="mt-3 flex flex-wrap items-center gap-2 pt-2 border-t border-white/5 text-xs">
        <span className="whitespace-nowrap rounded-md bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-400 border border-emerald-500/20">
          In Godown: {inGodown}
        </span>
        <span className="whitespace-nowrap rounded-md bg-blue-500/15 px-2.5 py-1 text-[11px] font-semibold text-blue-400 border border-blue-500/20">
          At Sites: {assigned}
        </span>
        <span className="whitespace-nowrap text-[11px] font-medium text-slate-400 ml-auto">
          Total: {tool.totalQuantity}
        </span>
      </div>
    </div>
  );
}
