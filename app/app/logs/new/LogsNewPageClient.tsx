"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { MapPin, ChevronRight, Plus } from "lucide-react";

import { CategoryPicker, type CategoryOption } from "@/components/logs/CategoryPicker";

type SiteOption = {
  siteId: string;
  name: string;
  location: string;
};

type Props = {
  initialCategories: CategoryOption[];
  initialSites: SiteOption[];
  siteId?: string;
  role: "Admin" | "Supervisor";
};

export function LogsNewPageClient({ initialCategories, initialSites, siteId, role }: Props) {
  const router = useRouter();
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(siteId ?? null);

  const selectedSite = useMemo(
    () => initialSites.find((s) => s.siteId === selectedSiteId) ?? null,
    [initialSites, selectedSiteId],
  );

  return (
    <div className="max-w-2xl mx-auto pt-4 pb-20">
      <AnimatePresence mode="wait">
        {!selectedSiteId ? (
          /* ── Step 1: Site Selection ── */
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between px-1 mb-6">
              <div>
                <h3 className="text-xl font-extrabold tracking-tight text-white uppercase">
                  Where are you reporting from?
                </h3>
                <p className="text-sm text-slate-500 font-medium italic mt-1.5">
                  Select the active project zone for this operational log.
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push("/app/sites/new")}
                className="btn-secondary flex items-center gap-1.5 px-3 py-2 shrink-0"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {initialSites.map((site, i) => (
                <motion.button
                  key={site.siteId}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.07 }}
                  onClick={() => setSelectedSiteId(site.siteId)}
                  className="card-standard p-5 flex items-center justify-between text-left hover:bg-white/5 transition-all active:scale-[0.99]"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-center shadow-lg shrink-0">
                      <MapPin className="w-5 h-5 text-slate-500" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-200 uppercase tracking-tight">{site.name}</h4>
                      <p className="text-xs text-slate-500 font-medium italic">{site.location}</p>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-slate-600 group-hover:bg-sky-500 group-hover:text-slate-950 transition-all">
                    <ChevronRight className="w-5 h-5" />
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        ) : (
          /* ── Step 2: Category Selection ── */
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            {/* Selected site banner */}
            <div className="card-standard p-4 border-sky-500/10 bg-sky-500/5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 bg-sky-500/10 border border-sky-500/20 rounded-xl flex items-center justify-center shrink-0">
                    <MapPin className="w-5 h-5 text-sky-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Reporting From</p>
                    <p className="text-sm font-bold text-white truncate">{selectedSite?.name}</p>
                    <p className="text-xs text-slate-500 italic">{selectedSite?.location}</p>
                  </div>
                </div>
                {!siteId ? (
                  <button
                    type="button"
                    onClick={() => setSelectedSiteId(null)}
                    className="btn-secondary px-3 py-2 shrink-0"
                  >
                    Change
                  </button>
                ) : null}
              </div>
            </div>

            <CategoryPicker
              initialCategories={initialCategories}
              role={role}
              siteId={selectedSiteId}
              onSelect={(c) => {
                const qs = `?siteId=${encodeURIComponent(selectedSiteId)}`;
                router.push(`/app/logs/new/${c.categoryId}${qs}`);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
