import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { can } from '@/lib/auth/capabilities';
import { safeGetSessionFromHeaders } from '@/lib/auth/session';
import { getAdminAnalytics } from '@/lib/db/queries/adminAnalytics';
import { generateRequestId } from '@/lib/utils/requestId';

import { AdminAnalyticsPageClient } from './AdminAnalyticsPageClient';

export const dynamic = 'force-dynamic';

const DEFAULT_PERIOD = '30d' as const;

// Server-rendered with initial data (audit F16). The capability gate lives here
// now — GET /api/admin/analytics requires admin, so the page must too, checked
// BEFORE the query runs.
export default async function AdminAnalyticsPage() {
  const session = await safeGetSessionFromHeaders(await headers());
  if (!session) {
    redirect('/auth/sign-in');
  }
  if (!can(session.user.role, 'analytics:read')) notFound();

  const initialAnalytics = await getAdminAnalytics(generateRequestId(), DEFAULT_PERIOD);
  return (
    <AdminAnalyticsPageClient
      initialPeriod={DEFAULT_PERIOD}
      initialAnalytics={initialAnalytics}
    />
  );
}
