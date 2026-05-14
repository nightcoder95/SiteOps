import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { checkOwnership } from '@/lib/auth/ownership';
import { safeGetSessionFromHeaders } from '@/lib/auth/session';
import { getEntriesBySite } from '@/lib/db/queries/entries';
import { getAllSites, getSiteById, getSitesBySupervisor } from '@/lib/db/queries/sites';

import SiteDetailPageClient from './SiteDetailPageClient';

export default async function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await safeGetSessionFromHeaders(await headers());
  if (!session) {
    redirect('/auth/sign-in');
  }

  const { id: siteId } = await params;
  const site = await getSiteById(siteId);
  if (!site || site.archivedAt) {
    notFound();
  }

  if (!checkOwnership(session.user, site.supervisorId)) {
    notFound();
  }

  const [initialEntries, initialSites] = await Promise.all([
    getEntriesBySite(siteId, 'all'),
    session.user.role === 'Admin' ? getAllSites() : getSitesBySupervisor(session.user.id),
  ]);
  const initialEntriesJson = JSON.parse(JSON.stringify(initialEntries));
  const initialSiteJson = JSON.parse(JSON.stringify(site));
  const initialSitesJson = JSON.parse(JSON.stringify(initialSites));

  return (
    <SiteDetailPageClient
      siteId={siteId}
      initialSite={initialSiteJson}
      initialEntries={initialEntriesJson}
      initialSites={initialSitesJson}
    />
  );
}
