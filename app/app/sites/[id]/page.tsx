import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { checkOwnership } from '@/lib/auth/ownership';
import { safeGetSessionFromHeaders } from '@/lib/auth/session';
import { DEFAULT_ENTRIES_LIMIT, getEntriesBySite } from '@/lib/db/queries/entries';
import { getSiteById } from '@/lib/db/queries/sites';
import { serializeRow } from '@/lib/utils/serialize';

import SiteDetailPageClient from './SiteDetailPageClient';

export default async function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = safeGetSessionFromHeaders(await headers());
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

  const initialEntries = await getEntriesBySite(siteId, 'all', { limit: DEFAULT_ENTRIES_LIMIT });

  return (
    <SiteDetailPageClient
      siteId={siteId}
      initialSite={serializeRow(site) as any}
      initialEntries={serializeRow(initialEntries) as any}
      role={session.user.role as "Admin" | "Supervisor"}
    />
  );
}
