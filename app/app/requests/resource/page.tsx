import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { safeGetSessionFromHeaders } from '@/lib/auth/session';
import { getResourceRequestsFor } from '@/lib/db/queries/resourceRequests';

import { ResourceRequestsPageClient } from './ResourceRequestsPageClient';

export const dynamic = 'force-dynamic';

// Server-rendered with initial data (audit F16). Authorization lives here now:
// the page is reachable by any signed-in user, and getResourceRequestsFor scopes
// the rows by capability exactly as GET /api/requests/resource does.
export default async function ResourceRequestsPage() {
  const session = await safeGetSessionFromHeaders(await headers());
  if (!session) {
    redirect('/auth/sign-in');
  }

  const initialRequests = await getResourceRequestsFor(session.user);
  return <ResourceRequestsPageClient initialRequests={initialRequests} />;
}
