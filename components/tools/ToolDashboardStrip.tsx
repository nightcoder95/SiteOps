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
    <div className="flex flex-col items-center justify-center py-2 px-1 text-center min-w-0">
      <div className="flex items-center gap-1">
        <Icon className={`h-3 w-3 shrink-0 ${iconTone}`} strokeWidth={2} />
        <span className={`text-sm font-bold tabular-nums leading-none ${valueTone}`}>{value}</span>
      </div>
      <p className="mt-0.5 text-[9px] font-medium uppercase leading-tight tracking-wider text-on-surface-variant">
        {label}
      </p>
    </div>
  );
}

// KPI strip for the hub — Tool Types / Total Units / Free / Deployed.
export function ToolDashboardStrip() {
  const { data: result, isLoading } = useToolDashboard();

  if (isLoading) {
    return <div className="h-11 animate-pulse rounded-xl bg-surface-container-low" />;
  }
  if (!result?.ok) return null;
  const d = result.data;

  return (
    <div className="grid grid-cols-4 divide-x divide-white/5 rounded-xl border border-white/5 bg-surface-container-lowest px-2 py-0.5">
      <StatItem label="Types" value={d.totalTools} Icon={LayoutGrid} valueTone="text-white" iconTone="text-blue-500" />
      <StatItem label="Units" value={d.totalQuantity} Icon={Package} valueTone="text-white" iconTone="text-blue-500" />
      <StatItem label="Free" value={d.free} Icon={CheckCircle2} valueTone="text-emerald-400" iconTone="text-emerald-400" />
      <StatItem label="Deployed" value={d.deployed} Icon={ArrowUpRight} valueTone="text-blue-500" iconTone="text-blue-500" />
    </div>
  );
}
