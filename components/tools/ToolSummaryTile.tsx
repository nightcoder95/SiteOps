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
        <div className="card-standard p-5 transition-colors hover:bg-white/5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/5 ring-1 ring-white/10">
                <Wrench className="h-4 w-4 text-slate-300" />
              </span>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Company Tools</p>
            </div>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20">
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>

          {/* KPI tiles */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
              {isLoading ? (
                <div className="h-9 w-12 animate-pulse rounded bg-white/5" />
              ) : (
                <span className="block text-4xl font-light leading-none tabular-nums text-white">{d?.free ?? 0}</span>
              )}
              <span className="mt-2 block text-[10px] font-bold uppercase tracking-widest text-emerald-400">Free Tools</span>
            </div>
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4">
              {isLoading ? (
                <div className="h-9 w-12 animate-pulse rounded bg-white/5" />
              ) : (
                <span className="block text-4xl font-light leading-none tabular-nums text-white">{d?.deployed ?? 0}</span>
              )}
              <span className="mt-2 block text-[10px] font-bold uppercase tracking-widest text-sky-400">Deployed</span>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
