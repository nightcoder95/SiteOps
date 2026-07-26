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
      <div className="flex rounded-xl border border-white/10 bg-slate-900/80 p-1 shadow-xs">
        {TABS.map(({ label, icon: Icon }) => {
          const active = label === tab;
          return (
            <button
              key={label}
              type="button"
              onClick={() => selectTab(label)}
              className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
                active
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>

      {tab === "Operations" ? <CatalogManager /> : tab === "Units" ? <UnitsManager /> : <ToolCatalogManager />}
    </div>
  );
}
