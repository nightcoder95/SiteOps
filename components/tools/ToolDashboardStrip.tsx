"use client";

import { LayoutGrid, Package, CheckCircle2, ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useToolDashboard } from "@/lib/client/tools";

function StatCard({
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
    <div className="flex flex-col gap-2.5 rounded-2xl border border-white/5 bg-surface-container-lowest p-3 sm:p-4">
      <Icon className={`h-5 w-5 shrink-0 ${iconTone}`} strokeWidth={2} />
      <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-on-surface-variant sm:text-[11px]">
        {label}
      </p>
      <span className={`text-2xl font-extrabold tabular-nums leading-none sm:text-3xl ${valueTone}`}>{value}</span>
    </div>
  );
}

// KPI strip for the hub — Tool Types / Total Units / Free / Deployed.
export function ToolDashboardStrip() {
  const { data: result, isLoading } = useToolDashboard();

  if (isLoading) {
    return (
      <div className="grid grid-cols-4 gap-2.5 sm:gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-container-low" />
        ))}
      </div>
    );
  }
  if (!result?.ok) return null;
  const d = result.data;

  return (
    <div className="grid grid-cols-4 gap-2.5 sm:gap-3">
      <StatCard label="Tool Types" value={d.totalTools} Icon={LayoutGrid} valueTone="text-white" iconTone="text-blue-500" />
      <StatCard label="Total Units" value={d.totalQuantity} Icon={Package} valueTone="text-white" iconTone="text-blue-500" />
      <StatCard label="Free" value={d.free} Icon={CheckCircle2} valueTone="text-emerald-400" iconTone="text-emerald-400" />
      <StatCard label="Deployed" value={d.deployed} Icon={ArrowUpRight} valueTone="text-blue-500" iconTone="text-blue-500" />
    </div>
  );
}
