'use client';

import Link from 'next/link';
import { Building2, ChevronRight, MapPin } from 'lucide-react';

import { timeAgo } from '@/lib/utils/formatDate';

export type SiteRowData = {
  id: string;
  name: string;
  location: string;
  status: 'In Progress' | 'Blocked' | 'Completed';
  currentProgress: number | null;
  updatedAt: string | Date;
};

// Visual tokens per status, shared by the badge and the leading status dot.
const STATUS_STYLES: Record<SiteRowData['status'], { badge: string; dot: string }> = {
  'In Progress': { badge: 'badge-emerald', dot: 'bg-emerald-400' },
  Blocked: { badge: 'badge-amber', dot: 'bg-amber-400' },
  Completed: { badge: 'badge-sky', dot: 'bg-sky-400' },
};

// A small deterministic palette for the leading icon tile so each site reads as
// a distinct object (matches the multi-colour tiles in the design). Colour is
// derived from the id so it stays stable across renders and reloads.
const TILE_STYLES = [
  'bg-sky-500/15 text-sky-300 ring-sky-500/20',
  'bg-violet-500/15 text-violet-300 ring-violet-500/20',
  'bg-amber-500/15 text-amber-300 ring-amber-500/20',
  'bg-emerald-500/15 text-emerald-300 ring-emerald-500/20',
  'bg-rose-500/15 text-rose-300 ring-rose-500/20',
  'bg-cyan-500/15 text-cyan-300 ring-cyan-500/20',
] as const;

function tileStyle(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return TILE_STYLES[Math.abs(hash) % TILE_STYLES.length];
}

export function SiteRow({ site }: { site: SiteRowData }) {
  const styles = STATUS_STYLES[site.status] ?? STATUS_STYLES['In Progress'];
  const updated = timeAgo(site.updatedAt);

  return (
    <Link
      href={`/app/sites/${site.id}`}
      className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none"
    >
      {/* Live status dot */}
      <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${styles.dot} shadow-[0_0_8px] shadow-current`} />

      {/* Colour-coded icon tile */}
      <span
        aria-hidden
        className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ring-1 ${tileStyle(site.id)}`}
      >
        <Building2 className="h-5 w-5" />
      </span>

      {/* Name + meta */}
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold uppercase tracking-tight text-white transition-colors group-hover:text-sky-400">
          {site.name}
        </span>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {site.location}
          </span>
          {updated ? (
            <>
              <span aria-hidden className="text-slate-700">•</span>
              <span>{updated}</span>
            </>
          ) : null}
        </div>
      </div>

      {/* Status badge + chevron */}
      <span className={`${styles.badge} shrink-0`}>{site.status}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-600 transition-colors group-hover:text-slate-400" />
    </Link>
  );
}
