import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import AppShell from '@/components/app-shell/AppShell';
import { safeGetSessionFromHeaders } from '@/lib/auth/session';
import { getNotificationCountForUser } from '@/lib/db/queries/notifications';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await safeGetSessionFromHeaders(await headers());
  const role = session?.user.role ?? 'Supervisor';

  // Seed the unread badge server-side so the header renders instantly without a
  // cold client round-trip on first load (SWR still revalidates in background).
  // Best-effort: a notifications hiccup must never break the whole app shell.
  let initialUnread = 0;
  if (session) {
    try {
      initialUnread = await getNotificationCountForUser(session.user.id, { unreadOnly: true });
    } catch {
      initialUnread = 0;
    }
  }

  return (
    <AppShell role={role} initialUnread={initialUnread}>
      {children}
    </AppShell>
  );
}
