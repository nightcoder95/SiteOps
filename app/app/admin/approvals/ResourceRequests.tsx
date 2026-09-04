'use client';

import { useEffect, useOptimistic, useState } from 'react';

import { ApiUnavailableBanner } from '@/components/ui/ApiUnavailableBanner';
import { requestJson, type ClientResult } from '@/lib/http/client';
import { toastClientError, toastSuccess } from '@/lib/ui/toast';

export type ResourceRequest = {
  id: number;
  requestId: string;
  siteId: string;
  requestType: 'Labour' | 'Materials' | 'Money' | 'Machinery';
  details: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Declined';
  requestedBy: string;
};

// Extracted from the 337-line approvals page (audit F12). The fetch, the
// optimistic reducer and the review handler are the originals — endpoint,
// method, body and toast copy are unchanged. Only the styling moved from the
// Material-compat tokens to the app's sky/slate vocabulary, with 44 px targets.
export function ResourceRequests({ initialRequests }: { initialRequests: ResourceRequest[] }) {
  // Seeded from the server render so the queue is in the first paint (audit
  // F16); the mount-time load() below still revalidates.
  const [result, setResult] = useState<ClientResult<ResourceRequest[]> | null>(
    { ok: true, data: initialRequests, status: 200 } as ClientResult<ResourceRequest[]>,
  );
  const [pendingId, setPendingId] = useState<string | null>(null);

  const [optimistic, applyOptimistic] = useOptimistic(
    result?.ok ? result.data : ([] as ResourceRequest[]),
    (current, action: { requestId: string; status: 'Approved' | 'Declined' }) =>
      current.map((item) =>
        item.requestId === action.requestId ? { ...item, status: action.status } : item,
      ),
  );

  async function load() {
    setResult(await requestJson<ResourceRequest[]>('/api/requests/resource'));
  }

  useEffect(() => {
    void load();
  }, []);

  async function review(requestId: string, status: 'Approved' | 'Declined') {
    applyOptimistic({ requestId, status });
    setPendingId(requestId);
    const next = await requestJson(`/api/requests/resource/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (next.ok) {
      toastSuccess(`Resource request ${status.toLowerCase()}`);
      await load();
    } else {
      toastClientError(next);
      setResult(next as ClientResult<ResourceRequest[]>);
    }
    setPendingId(null);
  }

  return (
    <div className="card-standard p-4">
      <h3 className="text-lg font-bold text-slate-100">Resource requests</h3>

      {result && !result.ok && result.kind === 'endpoint_unavailable' ? (
        <div className="mt-3">
          <ApiUnavailableBanner endpoint={result.endpoint} method={result.method} />
        </div>
      ) : null}

      <div className="mt-4 grid gap-3">
        {result?.ok ? optimistic.map((request) => (
          <article key={request.requestId} className="rounded-2xl border border-white/5 bg-slate-900/40 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-black text-slate-100">{request.requestType}</div>
                <div className="text-sm text-slate-400">Site {request.siteId}</div>
              </div>
              <span className="badge-sky">{request.status}</span>
            </div>
            <p className="mt-3 text-sm font-medium text-slate-200">{request.details}</p>
            {request.status === 'Pending' ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pendingId === request.requestId}
                  onClick={() => review(request.requestId, 'Approved')}
                  className="btn-primary min-h-11 px-5"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={pendingId === request.requestId}
                  onClick={() => review(request.requestId, 'Declined')}
                  className="btn-secondary min-h-11 px-5 disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            ) : null}
          </article>
        )) : null}
        {result?.ok && optimistic.length === 0 ? (
          <p className="text-sm text-slate-400">No resource requests.</p>
        ) : null}
      </div>
    </div>
  );
}
