import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { safeGetSessionFromHeaders } from '@/lib/auth/session';
import { listSitesFor } from '@/lib/db/queries/sitesList';

import { AdminExpensesPageClient } from './AdminExpensesPageClient';

export const dynamic = 'force-dynamic';

// Server-rendered with the site list already resolved (audit F16). listSitesFor
// applies the same site:read_all scoping GET /api/sites does, so a supervisor
// only ever receives their own sites in the HTML payload.
export default async function AdminExpensesPage() {
  const session = await safeGetSessionFromHeaders(await headers());
  if (!session) {
    redirect('/auth/sign-in');
  }

  const initialSites = await listSitesFor(session.user);
  return <AdminExpensesPageClient initialSites={initialSites} />;
}
