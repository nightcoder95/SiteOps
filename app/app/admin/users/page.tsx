import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { safeGetSessionFromHeaders } from '@/lib/auth/session';
import { listAdminUsers } from '@/lib/db/queries/adminUsers';

import { AdminUsersPageClient } from './AdminUsersPageClient';

export const dynamic = 'force-dynamic';

// Server-rendered with initial data (audit F16). listAdminUsers re-reads the
// actor's role from the DB and returns { ok: false } for anyone without
// user:list, so a demoted admin holding a valid token gets a 404 here and no
// user list is serialised into the HTML.
export default async function AdminUsersPage() {
  const session = await safeGetSessionFromHeaders(await headers());
  if (!session) {
    redirect('/auth/sign-in');
  }

  const result = await listAdminUsers(session.user.id);
  if (!result.ok) notFound();

  return <AdminUsersPageClient initialUsers={result.users} />;
}
