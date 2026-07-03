'use client';

import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Ban, Layers, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { SiteRow, type SiteRowData } from './SiteRow';

const FILTERS: { label: 'All' | 'In Progress' | 'Blocked' | 'Completed'; icon: LucideIcon }[] = [
  { label: 'All', icon: Layers },
  { label: 'In Progress', icon: RefreshCw },
  { label: 'Blocked', icon: Ban },
  { label: 'Completed', icon: CheckCircle2 },
];
type Filter = (typeof FILTERS)[number]['label'];

const COLLAPSED_COUNT = 5;

export function SitesCard({ sites }: { sites: SiteRowData[] }) {
  const [filter, setFilter] = useState<Filter>('All');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const liveCount = sites.length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sites.filter((s) => {
      if (filter !== 'All' && s.status !== filter) return false;
      if (q && !s.name.toLowerCase().includes(q) && !s.location.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sites, filter, query]);

  const visible = expanded ? filtered : filtered.slice(0, COLLAPSED_COUNT);

  return (
    <section>
      {/* Section title + controls (lives outside the card, matching the design) */}
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2.5">
          <h2 className="text-2xl font-extrabold tracking-tight text-white">Sites</h2>
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400" />
          <span className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold tabular-nums text-white">{liveCount}</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Live</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={searchOpen ? 'Close search' : 'Search sites'}
            aria-expanded={searchOpen}
            onClick={() => {
              setSearchOpen((v) => !v);
              if (searchOpen) setQuery('');
            }}
            className={`grid h-10 w-10 cursor-pointer place-items-center rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 ${
              searchOpen
                ? 'border-sky-500/40 bg-sky-500/10 text-sky-400'
                : 'border-white/10 bg-white/5 text-slate-400 hover:text-slate-200'
            }`}
          >
            {searchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
          </button>
          <button
            type="button"
            aria-label={filterOpen ? 'Hide filters' : 'Show filters'}
            aria-expanded={filterOpen}
            onClick={() => setFilterOpen((v) => !v)}
            className={`grid h-10 w-10 cursor-pointer place-items-center rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 ${
              filterOpen
                ? 'border-sky-500/40 bg-sky-500/10 text-sky-400'
                : 'border-white/10 bg-white/5 text-slate-400 hover:text-slate-200'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search input */}
      {searchOpen ? (
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or location…"
          className="input-standard mb-3"
        />
      ) : null}

      {/* Filter chips */}
      {filterOpen ? (
        <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map(({ label, icon: Icon }) => {
            const active = label === filter;
            return (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setFilter(label);
                  setExpanded(false);
                }}
                className={`flex shrink-0 cursor-pointer items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-bold tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 ${
                  active
                    ? 'bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/20'
                    : 'border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Rows */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-standard"
      >
        {visible.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">
            {sites.length === 0 ? 'No active sites yet.' : 'No sites match your filters.'}
          </p>
        ) : (
          <div className="divide-y divide-white/5">
            {visible.map((site) => (
              <SiteRow key={site.id} site={site} />
            ))}
          </div>
        )}

        {/* Show all / collapse */}
        {filtered.length > COLLAPSED_COUNT ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full cursor-pointer border-t border-white/5 px-5 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-sky-400 transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50"
          >
            {expanded ? 'Show less' : `Show all ${filtered.length} sites`}
          </button>
        ) : null}
      </motion.div>
    </section>
  );
}
