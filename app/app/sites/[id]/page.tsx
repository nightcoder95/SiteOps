import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { can } from '@/lib/auth/capabilities';
import { checkOwnership } from '@/lib/auth/ownership';
import { safeGetSessionFromHeaders } from '@/lib/auth/session';
import { getSiteOperationSummary } from '@/lib/db/queries/entries';
import { getSiteById, getSiteTrackedSpend } from '@/lib/db/queries/sites';
import { listSupervisors, type SupervisorOption } from '@/lib/users/listSupervisors';
import { serializeRow } from '@/lib/utils/serialize';

import SiteDetailPageClient from './SiteDetailPageClient';

export default async function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = safeGetSessionFromHeaders(await headers());
  if (!session) {
    redirect('/auth/sign-in');
  }

  const { id: siteId } = await params;
  const site = await getSiteById(siteId);
  if (!site || site.archivedAt || site.isDeleted) {
    notFound();
  }

  if (!checkOwnership(session.user, site.supervisorId)) {
    notFound();
  }

  const [initialSummary, trackedSpend, supervisors] = await Promise.all([
    getSiteOperationSummary(siteId),
    getSiteTrackedSpend(siteId),
    can(session.user.role, 'resource:manage_all')
      ? listSupervisors()
      : Promise.resolve([] as SupervisorOption[]),
  ]);

  return (
    <SiteDetailPageClient
      siteId={siteId}
      initialSite={serializeRow(site) as any}
      initialSummary={serializeRow(initialSummary) as any}
      trackedSpend={trackedSpend}
      role={session.user.role as "Admin" | "Supervisor"}
      supervisors={supervisors}
    />
  );
}
