import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { can } from '@/lib/auth/capabilities';
import { safeGetSessionFromHeaders } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { fieldRequests } from '@/lib/db/schema';

import { FieldRequestsPageClient } from './FieldRequestsPageClient';

export const dynamic = 'force-dynamic';

// Server-rendered with initial data (audit F16). GET /api/requests/field is
// admin-only, so the same gate runs here BEFORE the query — otherwise the list
// would be serialised into the HTML for a supervisor.
export default async function FieldRequestsPage() {
  const session = await safeGetSessionFromHeaders(await headers());
  if (!session) {
    redirect('/auth/sign-in');
  }
  if (!can(session.user.role, 'field_request:read')) notFound();

  const initialRequests = await db.select().from(fieldRequests);
  return <FieldRequestsPageClient initialRequests={initialRequests} />;
}
