import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { can } from '@/lib/auth/capabilities';
import { safeGetSessionFromHeaders } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { getResourceRequestsFor } from '@/lib/db/queries/resourceRequests';
import { listTransfersFor } from '@/lib/db/queries/transfersList';
import { fieldRequests } from '@/lib/db/schema';

import { FieldRequests } from './FieldRequests';
import { ResourceRequests } from './ResourceRequests';
import { TransferApprovals } from './TransferApprovals';

export const dynamic = 'force-dynamic';

// Layout shell + server-rendered initial data (audit F12 + F16). Each queue owns
// its own revalidation, optimistic state and review handler; this file used to
// carry all three plus 8 useState and 3 useOptimistic in one 337-line function.
//
// /app/admin/* is already gated by app/app/admin/layout.tsx; the checks below
// are the per-page repeat the F16 rules ask for, and they run BEFORE any query,
// so no approval data reaches the HTML for a non-admin.
export default async function AdminApprovalsPage() {
  const session = await safeGetSessionFromHeaders(await headers());
  if (!session) {
    redirect('/auth/sign-in');
  }
  if (!can(session.user.role, 'resource_request:approve')) notFound();
  if (!can(session.user.role, 'field_request:read')) notFound();

  const [initialResource, initialField, initialTransfers] = await Promise.all([
    getResourceRequestsFor(session.user),
    db.select().from(fieldRequests),
    listTransfersFor(session.user),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <header className="card-standard p-4">
        <h2 className="text-lg font-bold text-white">Review Queues</h2>
        <p className="text-sm text-slate-400">
          Resource requests, field requests, transfer requests, and duplicate category reviews.
        </p>
      </header>

      <FieldRequests initialRequests={initialField} />

      <section className="grid gap-4">
        <ResourceRequests initialRequests={initialResource} />
        <TransferApprovals initialTransfers={initialTransfers} />
      </section>
    </div>
  );
}
