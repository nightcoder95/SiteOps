'use client';

import { Check, Factory, HardHat, Package, Send, Wallet, X, type LucideIcon } from 'lucide-react';
import { useState } from 'react';

import { ApiUnavailableBanner } from '@/components/ui/ApiUnavailableBanner';
import { requestJson, type ClientResult } from '@/lib/http/client';
import { useApiResult } from '@/lib/http/useApiQuery';
import { toastClientError, toastSuccess } from '@/lib/ui/toast';

type ResourceRequest = {
  // `id` is the numeric identity column; `requestId` is the uuid every
  // /api/requests/resource/{id} route matches on. This page used to send `id`,
  // which always 404'd — fixed while converting the page to SSR.
  id: number;
  requestId: string;
  siteId: string;
  requestType: 'Labour' | 'Materials' | 'Money' | 'Machinery';
  details: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Declined';
  requestedBy: string;
};

const labelClass = 'text-xs font-semibold uppercase text-on-surface-variant';
const inputClass =
  'h-11 w-full rounded border border-outline bg-surface-container-lowest px-3 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';
const textareaClass =
  'min-h-[88px] w-full rounded border border-outline bg-surface-container-lowest p-3 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';

const TYPE_ICONS: Record<ResourceRequest['requestType'], LucideIcon> = {
  Labour: HardHat,
  Materials: Package,
  Money: Wallet,
  Machinery: Factory,
};

function statusChip(status: ResourceRequest['status']) {
  switch (status) {
    case 'Approved':
      return 'bg-primary-container text-on-primary-container';
    case 'Declined':
      return 'bg-red-500/10 text-red-300';
    default:
      return 'bg-slate-500/15 text-slate-300';
  }
}

export function ResourceRequestsPageClient({
  initialRequests,
}: {
  initialRequests: ResourceRequest[];
}) {
  // Seeded from the server render so the first paint shows real rows instead
  // of "Loading…"; SWR still revalidates once on mount (audit F16).
  const { data: result, mutate } = useApiResult<ResourceRequest[]>('/api/requests/resource', {
    fallbackData: { ok: true, data: initialRequests, status: 200 } as ClientResult<ResourceRequest[]>,
  });
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function load() {
    await mutate();
  }

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
    await mutate(next, { revalidate: false });
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
      await mutate(next, { revalidate: false });
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
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
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
          className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded bg-primary text-xs font-semibold uppercase text-on-primary hover:bg-sky-400"
        >
          <Send className="w-[18px] h-[18px]" />
          Submit Request
        </button>
      </form>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-on-surface">Request Queue</h3>
          <span className="rounded-full bg-surface-container-low px-2 py-1 text-[10px] font-semibold text-on-surface-variant">
            {items.length}
          </span>
        </div>

        <div className="card-standard divide-y divide-outline-variant rounded-2xl">
          {items.length === 0 ? (
            <div className="p-4 text-sm text-on-surface-variant">
              {result?.ok ? 'No resource requests found.' : 'Loading…'}
            </div>
          ) : (
            items.map((request) => (
              <article key={request.requestId} className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
                      {(() => {
                        const TypeIcon = TYPE_ICONS[request.requestType];
                        return <TypeIcon className="w-5 h-5" />;
                      })()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-on-surface">{request.requestType}</div>
                      <div className="text-[10px] font-semibold text-on-surface-variant">Site {request.siteId}</div>
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold uppercase ${statusChip(request.status)}`}>
                    {request.status}
                  </span>
                </div>
                <p className="text-sm text-on-surface">{request.details}</p>
                <p className="text-[10px] font-semibold text-on-surface-variant">
                  <span className="uppercase">Reason:</span> {request.reason}
                </p>
                {request.status === 'Pending' ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={pendingId === request.requestId}
                      onClick={() => review(request.requestId, 'Approved')}
                      className="flex h-9 items-center gap-1 rounded bg-primary px-3 text-xs font-semibold uppercase text-on-primary disabled:opacity-60"
                    >
                      <Check className="w-4 h-4" />
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={pendingId === request.requestId}
                      onClick={() => review(request.requestId, 'Declined')}
                      className="flex h-9 items-center gap-1 rounded border border-outline px-3 text-xs font-semibold uppercase text-on-surface-variant disabled:opacity-60"
                    >
                      <X className="w-4 h-4" />
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
