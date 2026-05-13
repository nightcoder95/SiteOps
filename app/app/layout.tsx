import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import AppShell from '@/components/app-shell/AppShell';
import { safeGetSessionFromHeaders } from '@/lib/auth/session';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await safeGetSessionFromHeaders(await headers());
  const role = session?.user.role === 'Admin' ? 'Admin' : 'Supervisor';
  return <AppShell role={role}>{children}</AppShell>;
}
