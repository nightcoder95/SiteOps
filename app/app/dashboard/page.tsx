import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { safeGetSessionFromHeaders } from '@/lib/auth/session';

import { DashboardPageClient } from './DashboardPageClient';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await safeGetSessionFromHeaders(await headers());
  if (!session) {
    redirect('/auth/sign-in');
  }

  return <DashboardPageClient />;
}
