"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowUpRight, Wrench } from "lucide-react";

import { useToolDashboard } from "@/lib/client/tools";

// Home-dashboard summary card for the tool hub: a labelled header with an
// "open" affordance over two KPI tiles (free · deployed) → /app/tools.
// Rendered only when the caller has confirmed `can(role, 'tool:read')`.
export function ToolSummaryTile() {
  const { data: result, isLoading } = useToolDashboard();
  const d = result?.ok ? result.data : null;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Link href="/app/tools" className="block cursor-pointer">
        <div className="card-standard border-white/[0.03] p-4 transition-colors hover:bg-white/5">
          {/* Header */}
          <div className="flex items-center justify-between pt-1 pb-[18px] border-b border-white/5">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/5 border border-white/5">
                <Wrench className="h-3.5 w-3.5 text-slate-400" />
              </span>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-300">Company Tools</p>
            </div>
            <span className="grid h-6 w-6 place-items-center rounded-md border border-white/5 bg-white/[0.02] text-slate-400/80">
              <ArrowUpRight className="h-3.5 w-3.5" />
            </span>
          </div>

          {/* KPI tiles */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 flex flex-col justify-center">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-400">Free Tools</span>
              <div className="mt-2 flex items-baseline">
                {isLoading ? (
                  <div className="h-7 w-10 animate-pulse rounded bg-white/5" />
                ) : (
                  <span className="text-2xl font-semibold leading-none tabular-nums text-white">
                    {d?.free ?? 0}
                  </span>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 flex flex-col justify-center">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-sky-400">Deployed</span>
              <div className="mt-2 flex items-baseline">
                {isLoading ? (
                  <div className="h-7 w-10 animate-pulse rounded bg-white/5" />
                ) : (
                  <span className="text-2xl font-semibold leading-none tabular-nums text-white">
                    {d?.deployed ?? 0}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
