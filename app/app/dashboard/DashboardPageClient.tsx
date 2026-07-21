'use client';

import type { DashboardData } from '@/lib/services/dashboard';

import { ToolSummaryTile } from '@/components/tools/ToolSummaryTile';

import { ArchivedSites } from './ArchivedSites';
import { SitesCard } from './SitesCard';
import type { SiteRowData } from './SiteRow';

export function DashboardPageClient({ data, showToolTile = false }: { data: DashboardData; showToolTile?: boolean }) {
  const sites: SiteRowData[] = data.sites.map((s) => ({
    id: s.siteId,
    name: s.name,
    location: s.location,
    status: s.status,
    currentProgress: s.currentProgress,
    updatedAt: s.updatedAt,
  }));
  const archivedSites = data.archivedSites.map((s) => ({ siteId: s.siteId, name: s.name, location: s.location }));

  return (
    <div className="space-y-6 pb-20">
      {/* Sites: the Active-Sites count now lives in this card's header, so the
          stat and the list are one thing instead of two redundant blocks. */}
      <SitesCard sites={sites} />

      {/* Company Tools KPI tile — a genuinely separate destination (/app/tools). */}
      {showToolTile ? <ToolSummaryTile /> : null}

      <div className="pt-2.5">
        <ArchivedSites sites={archivedSites} />
      </div>
    </div>
  );
}
