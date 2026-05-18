import { isNull } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { TransferForm } from '@/components/transfers/TransferForm';
import { safeGetSessionFromHeaders } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { sites } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

export default async function TransfersNewPage({
  searchParams,
}: {
  searchParams: Promise<{ fromSite?: string }>;
}) {
  const session = await safeGetSessionFromHeaders(await headers());
  if (!session) redirect('/auth/sign-in');

  if (session.user.role !== 'Supervisor') {
    return (
      <div className="max-w-2xl mx-auto pt-4 pb-20 px-4">
        <div className="card-standard p-6">
          <h2 className="text-xl font-extrabold tracking-tight text-on-surface uppercase">Supervisors only</h2>
          <p className="mt-2 text-sm text-on-surface-variant">
            Cross-site transfers can only be requested by Supervisors.
          </p>
        </div>
      </div>
    );
  }

  const { fromSite } = await searchParams;
  const all = await db.select().from(sites).where(isNull(sites.archivedAt));
  const options = all.map((s) => ({
    siteId: s.siteId,
    name: s.name,
    location: s.location,
  }));

  return <TransferForm sites={options} defaultFromSiteId={fromSite} />;
}
