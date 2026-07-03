"use client";

import { useEffect, useState } from "react";
import { Package, Ruler, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { CatalogManager } from "@/components/catalog/CatalogManager";
import { UnitsManager } from "@/components/catalog/UnitsManager";
import { ToolCatalogManager } from "@/components/tools/ToolCatalogManager";

const TABS: { label: "Operations" | "Units" | "Tools"; icon: LucideIcon }[] = [
  { label: "Operations", icon: Package },
  { label: "Units", icon: Ruler },
  { label: "Tools", icon: Wrench },
];
type Tab = (typeof TABS)[number]["label"];

const paramToTab: Record<string, Tab> = { operations: "Operations", units: "Units", tools: "Tools" };

export function CatalogAdminTabs() {
  const [tab, setTab] = useState<Tab>("Operations");

  // Read the initial tab from ?tab= on mount (client-only, so no Suspense
  // boundary is required). Lets the "Tool missing? Add in catalog →" CTA
  // deep-link to ?tab=tools while preserving local-state tab UX thereafter.
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("tab");
    if (param && paramToTab[param.toLowerCase()]) setTab(paramToTab[param.toLowerCase()]);
  }, []);

  function selectTab(t: Tab) {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t.toLowerCase());
    window.history.replaceState(null, "", url.toString());
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-1.5">
          {TABS.map(({ label, icon: Icon }) => {
            const active = label === tab;
            return (
              <button
                key={label}
                type="button"
                onClick={() => selectTab(label)}
                className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-[15px] font-bold tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 ${
                  active
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
                {label}
              </button>
            );
          })}
        </div>
        <div className="mt-6 h-px bg-white/5" />
      </div>
      {tab === "Operations" ? <CatalogManager /> : tab === "Units" ? <UnitsManager /> : <ToolCatalogManager />}
    </div>
  );
}
