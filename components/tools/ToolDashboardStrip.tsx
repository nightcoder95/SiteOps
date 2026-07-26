"use client";

import { LayoutGrid, Package, CheckCircle2, ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useToolDashboard } from "@/lib/client/tools";

function StatItem({
  label,
  value,
  Icon,
  valueTone,
  iconTone,
}: {
  label: string;
  value: number | string;
  Icon: LucideIcon;
  valueTone: string;
  iconTone: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-2.5 text-center min-w-0">
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 shrink-0 ${iconTone}`} strokeWidth={2.5} />
        <span className={`text-base font-extrabold tabular-nums leading-none ${valueTone}`}>{value}</span>
      </div>
      <p className="mt-1.5 text-[10px] font-bold uppercase leading-none tracking-wider text-slate-400 whitespace-nowrap">
        {label}
      </p>
    </div>
  );
}

// KPI strip for the hub — Total Tools / Total Stock / In Godown / At Sites.
export function ToolDashboardStrip() {
  const { data: result, isLoading } = useToolDashboard();

  if (isLoading) {
    return <div className="h-16 animate-pulse rounded-xl bg-slate-900" />;
  }
  if (!result?.ok) return null;
  const d = result.data;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/10 rounded-xl border border-white/10 bg-slate-900/90 shadow-sm">
      <StatItem label="Total Tools" value={d.totalTools} Icon={LayoutGrid} valueTone="text-white" iconTone="text-blue-400" />
      <StatItem label="Total Stock" value={d.totalQuantity} Icon={Package} valueTone="text-white" iconTone="text-blue-400" />
      <StatItem label="In Godown" value={d.free} Icon={CheckCircle2} valueTone="text-emerald-400" iconTone="text-emerald-400" />
      <StatItem label="At Sites" value={d.deployed} Icon={ArrowUpRight} valueTone="text-blue-400" iconTone="text-blue-400" />
    </div>
  );
}
