import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { safeGetSessionFromHeaders } from '@/lib/auth/session';
import { getUserProfile } from '@/lib/db/queries/userProfile';
import { generateRequestId } from '@/lib/utils/requestId';

import { ProfilePageClient } from './ProfilePageClient';

export const dynamic = 'force-dynamic';

// Server-rendered with the caller's own profile (audit F16). No capability gate
// is needed — like GET /api/users/me this returns only the signed-in user's own
// record, and the id comes from the verified session, never from input.
export default async function ProfilePage() {
  const session = await safeGetSessionFromHeaders(await headers());
  if (!session) {
    redirect('/auth/sign-in');
  }

  const profile = await getUserProfile(generateRequestId(), session.user.id);
  return (
    <ProfilePageClient
      initialProfile={{
        user: session.user,
        profile,
      }}
    />
  );
}
