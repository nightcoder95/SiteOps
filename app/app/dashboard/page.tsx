import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { can } from '@/lib/auth/capabilities';
import { safeGetSessionFromHeaders } from '@/lib/auth/session';
import { getDashboardData } from '@/lib/services/dashboard';

import { DashboardPageClient } from './DashboardPageClient';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await safeGetSessionFromHeaders(await headers());
  if (!session) {
    redirect('/auth/sign-in');
  }

  const data = await getDashboardData(session.user);
  return <DashboardPageClient data={data} showToolTile={can(session.user.role, 'tool:read')} />;
}
