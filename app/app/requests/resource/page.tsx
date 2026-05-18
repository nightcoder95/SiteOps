'use client';

import { useEffect, useState } from 'react';

import { ApiUnavailableBanner } from '@/components/ui/ApiUnavailableBanner';
import { requestJson, type ClientResult } from '@/lib/http/client';
import { toastClientError, toastSuccess } from '@/lib/ui/toast';

type ResourceRequest = {
  id: string;
  siteId: string;
  requestType: 'Labour' | 'Materials' | 'Money' | 'Machinery';
  details: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Declined';
  requestedBy: string;
};

const labelClass = 'font-label-md text-label-md uppercase text-on-surface-variant';
const inputClass =
  'h-11 w-full rounded border border-outline bg-surface-container-lowest px-3 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';
const textareaClass =
  'min-h-[88px] w-full rounded border border-outline bg-surface-container-lowest p-3 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';

const TYPE_ICONS: Record<ResourceRequest['requestType'], string> = {
  Labour: 'engineering',
  Materials: 'inventory_2',
  Money: 'account_balance_wallet',
  Machinery: 'precision_manufacturing',
};

function statusChip(status: ResourceRequest['status']) {
  switch (status) {
    case 'Approved':
      return 'bg-primary-container text-on-primary-container';
    case 'Declined':
      return 'bg-error-container text-on-error-container';
    default:
      return 'bg-secondary-container text-on-secondary-container';
  }
}

export default function ResourceRequestsPage() {
  const [result, setResult] = useState<ClientResult<ResourceRequest[]> | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function load() {
    const next = await requestJson<ResourceRequest[]>('/api/requests/resource');
    setResult(next);
    return next;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await load();
      if (!cancelled) setResult(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const next = await requestJson<ResourceRequest>('/api/requests/resource', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteId: String(fd.get('siteId') ?? ''),
        type: String(fd.get('type') ?? ''),
        details: String(fd.get('details') ?? ''),
        reason: String(fd.get('reason') ?? ''),
      }),
    });

    if (next.ok) {
      toastSuccess('Request submitted');
      form.reset();
      await load();
      return;
    }
    toastClientError(next);
    setResult(next);
  }

  async function review(id: string, nextStatus: 'Approved' | 'Declined') {
    setPendingId(id);
    const next = await requestJson<ResourceRequest>(`/api/requests/resource/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (next.ok) {
      toastSuccess(`Request ${nextStatus.toLowerCase()}`);
      await load();
    } else {
      toastClientError(next);
      setResult(next);
    }
    setPendingId(null);
  }

  const items = result?.ok ? result.data : [];

  return (
    <div className="space-y-5 pb-20">
      <header>
        <h2 className="text-2xl font-extrabold tracking-tight text-on-surface">Resource Requests</h2>
        <p className="text-sm text-on-surface-variant">
          Request labour, materials, machinery, or funds.
        </p>
      </header>

      {result && !result.ok && result.kind === 'endpoint_unavailable' ? (
        <ApiUnavailableBanner endpoint={result.endpoint} method={result.method} />
      ) : null}
      {result && !result.ok && result.kind !== 'endpoint_unavailable' ? (
        <div className="rounded-xl border border-error-container bg-error-container/30 px-4 py-3 font-body-md text-body-md text-on-error-container">
          {result.message}
        </div>
      ) : null}

      <form onSubmit={submit} className="card-standard flex flex-col gap-4 rounded-2xl p-4">
        <h3 className="text-lg font-extrabold tracking-tight text-on-surface">New Request</h3>
        <div className="flex flex-col gap-2">
          <label htmlFor="siteId" className={labelClass}>Site ID</label>
          <input id="siteId" name="siteId" required className={inputClass} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="type" className={labelClass}>Resource Type</label>
          <select id="type" name="type" defaultValue="Materials" className={inputClass}>
            <option value="Labour">Labour</option>
            <option value="Materials">Materials</option>
            <option value="Money">Money</option>
            <option value="Machinery">Machinery</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="details" className={labelClass}>Details</label>
          <textarea id="details" name="details" required minLength={10} className={textareaClass} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="reason" className={labelClass}>Reason</label>
          <textarea id="reason" name="reason" required minLength={10} className={textareaClass} />
        </div>
        <button
          type="submit"
          className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded bg-primary font-label-md text-label-md uppercase text-on-primary hover:bg-surface-tint"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>send</span>
          Submit Request
        </button>
      </form>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-headline-sm text-headline-sm text-on-surface">Request Queue</h3>
          <span className="rounded-full bg-surface-container-low px-2 py-1 font-label-sm text-label-sm text-on-surface-variant">
            {items.length}
          </span>
        </div>

        <div className="card-standard divide-y divide-outline-variant rounded-2xl">
          {items.length === 0 ? (
            <div className="p-4 font-body-md text-body-md text-on-surface-variant">
              {result?.ok ? 'No resource requests found.' : 'Loading…'}
            </div>
          ) : (
            items.map((request) => (
              <article key={request.id} className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
                      <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                        {TYPE_ICONS[request.requestType]}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="font-body-md text-body-md font-semibold text-on-surface">{request.requestType}</div>
                      <div className="font-label-sm text-label-sm text-on-surface-variant">Site {request.siteId}</div>
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-1 font-label-md text-label-md uppercase ${statusChip(request.status)}`}>
                    {request.status}
                  </span>
                </div>
                <p className="font-body-md text-body-md text-on-surface">{request.details}</p>
                <p className="font-label-sm text-label-sm text-on-surface-variant">
                  <span className="uppercase">Reason:</span> {request.reason}
                </p>
                {request.status === 'Pending' ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={pendingId === request.id}
                      onClick={() => review(request.id, 'Approved')}
                      className="flex h-9 items-center gap-1 rounded bg-primary px-3 font-label-md text-label-md uppercase text-on-primary disabled:opacity-60"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>check</span>
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={pendingId === request.id}
                      onClick={() => review(request.id, 'Declined')}
                      className="flex h-9 items-center gap-1 rounded border border-outline px-3 font-label-md text-label-md uppercase text-on-surface-variant disabled:opacity-60"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
                      Decline
                    </button>
                  </div>
                ) : null}
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
