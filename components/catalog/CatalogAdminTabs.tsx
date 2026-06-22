"use client";

import { useState } from "react";

import { CatalogManager } from "@/components/catalog/CatalogManager";
import { UnitsManager } from "@/components/catalog/UnitsManager";

const TABS = ["Operations", "Units"] as const;

export function CatalogAdminTabs() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Operations");

  return (
    <div className="space-y-5">
      <div className="flex gap-2 border-b border-outline-variant pb-3">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${
              t === tab
                ? "bg-primary text-on-primary"
                : "border border-outline text-on-surface-variant hover:bg-surface-container-low"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Operations" ? <CatalogManager /> : <UnitsManager />}
    </div>
  );
}
