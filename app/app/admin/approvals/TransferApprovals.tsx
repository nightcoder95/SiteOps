'use client';

import { useEffect, useOptimistic, useState } from 'react';

import { ApiUnavailableBanner } from '@/components/ui/ApiUnavailableBanner';
import { requestJson, type ClientResult } from '@/lib/http/client';
import { toastClientError, toastSuccess } from '@/lib/ui/toast';

export type Transfer = {
  id: number;
  transferId: string;
  fromSiteId: string;
  toSiteId: string;
  // Widened to match the resource_transfers column: the original component
  // typed only Labour|Materials, but Money and Machinery are valid values too.
  resourceType: 'Labour' | 'Materials' | 'Money' | 'Machinery';
  status: 'Pending' | 'Approved' | 'Declined';
  quantity: string;
  remarks: string | null;
  requestedByUserId: string;
};

// Extracted from the approvals page (audit F12). Endpoint, method, body and
// toast copy are the originals.
export function TransferApprovals({ initialTransfers }: { initialTransfers: Transfer[] }) {
  // Seeded from the server render so the queue is in the first paint (audit
  // F16); the mount-time load() below still revalidates.
  const [result, setResult] = useState<ClientResult<Transfer[]> | null>(
    { ok: true, data: initialTransfers, status: 200 } as ClientResult<Transfer[]>,
  );
  const [pendingId, setPendingId] = useState<string | null>(null);

  const [optimistic, applyOptimistic] = useOptimistic(
    result?.ok ? result.data : ([] as Transfer[]),
    (current, action: { transferId: string; status: 'Approved' | 'Declined' }) =>
      current.map((item) =>
        item.transferId === action.transferId ? { ...item, status: action.status } : item,
      ),
  );

  async function load() {
    setResult(await requestJson<Transfer[]>('/api/transfers'));
  }

  useEffect(() => {
    void load();
  }, []);

  async function review(transferId: string, status: 'Approved' | 'Declined') {
    applyOptimistic({ transferId, status });
    setPendingId(transferId);
    const next = await requestJson(`/api/transfers/${transferId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (next.ok) {
      toastSuccess(`Transfer ${status.toLowerCase()}`);
      await load();
    } else {
      toastClientError(next);
      setResult(next as ClientResult<Transfer[]>);
    }
    setPendingId(null);
  }

  return (
    <div className="card-standard p-4">
      <h3 className="text-lg font-bold text-slate-100">Transfer requests</h3>

      {result && !result.ok && result.kind === 'endpoint_unavailable' ? (
        <div className="mt-3">
          <ApiUnavailableBanner endpoint={result.endpoint} method={result.method} />
        </div>
      ) : null}

      <div className="mt-4 grid gap-3">
        {result?.ok ? optimistic.map((transfer) => (
          <article key={transfer.transferId} className="rounded-2xl border border-white/5 bg-slate-900/40 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-black text-slate-100">{transfer.resourceType} Transfer</div>
                <div className="text-sm text-slate-400">{transfer.fromSiteId} → {transfer.toSiteId}</div>
              </div>
              <span className="badge-sky">{transfer.status}</span>
            </div>
            <p className="mt-3 text-sm font-medium text-slate-200">
              Qty: {transfer.quantity}{transfer.remarks ? ` • ${transfer.remarks}` : ''}
            </p>
            {transfer.status === 'Pending' ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pendingId === transfer.transferId}
                  onClick={() => review(transfer.transferId, 'Approved')}
                  className="btn-primary min-h-11 px-5"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={pendingId === transfer.transferId}
                  onClick={() => review(transfer.transferId, 'Declined')}
                  className="btn-secondary min-h-11 px-5 disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            ) : null}
          </article>
        )) : null}
        {result?.ok && optimistic.length === 0 ? (
          <p className="text-sm text-slate-400">No transfer requests.</p>
        ) : null}
      </div>
    </div>
  );
}
