'use client';

import { useEffect, useState } from 'react';

import { ApiUnavailableBanner } from '@/components/ui/ApiUnavailableBanner';
import { PageHero, PageStack } from '@/components/ui/page-primitives';
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

    async function initialLoad() {
      const next = await load();
      if (cancelled) return;
      setResult(next);
    }

    initialLoad();

    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

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
      e.currentTarget.reset();
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
    <PageStack>
      <PageHero
        eyebrow="Requests"
        title="Resource requests"
        description="Supervisor-created requests stay live and admins can review them from the same route."
      />

      {result && !result.ok && result.kind === 'endpoint_unavailable' ? (
        <ApiUnavailableBanner endpoint={result.endpoint} method={result.method} />
      ) : null}
      {result && !result.ok && result.kind !== 'endpoint_unavailable' ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          {result.message}
        </div>
      ) : null}
      <form onSubmit={submit} className="rounded-[1.75rem] border border-outline-variant bg-surface p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
        <h3 className="text-lg font-black text-on-surface">New request</h3>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-2 text-sm font-semibold text-on-surface">
            Site Id
            <input name="siteId" required className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface" />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-on-surface">
            Type
            <select name="type" defaultValue="Materials" className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface">
              <option value="Labour">Labour</option>
              <option value="Materials">Materials</option>
              <option value="Money">Money</option>
              <option value="Machinery">Machinery</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-on-surface">
            Details
            <textarea name="details" required minLength={10} className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface" />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-on-surface">
            Reason
            <textarea name="reason" required minLength={10} className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface" />
          </label>
          <button type="submit" className="rounded-full bg-machined-gradient px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary/20">
            Submit
          </button>
        </div>
      </form>

      <section className="rounded-[1.75rem] border border-outline-variant bg-surface p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-black text-on-surface">Request queue</h3>
          <span className="rounded-full bg-surface-container-low px-3 py-1 text-[10px] font-black uppercase tracking-[0.28em] text-on-surface-variant">
            {items.length}
          </span>
        </div>

        <div className="mt-4 grid gap-3">
          {items.length > 0 ? (
            items.map((request) => (
              <article key={request.id} className="rounded-2xl bg-surface-container-low px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-black text-on-surface">{request.requestType}</div>
                    <div className="text-sm text-on-surface-variant">Site {request.siteId}</div>
                  </div>
                  <span className="rounded-full bg-surface px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-on-surface-variant">
                    {request.status}
                  </span>
                </div>
                <p className="mt-3 text-sm font-medium text-on-surface">{request.details}</p>
                <p className="mt-1 text-sm font-medium text-on-surface-variant">Reason: {request.reason}</p>
                {request.status === 'Pending' ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={pendingId === request.id}
                      onClick={() => review(request.id, 'Approved')}
                      className="rounded-full bg-machined-gradient px-4 py-2 text-sm font-black text-white disabled:opacity-60"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={pendingId === request.id}
                      onClick={() => review(request.id, 'Declined')}
                      className="rounded-full bg-surface px-4 py-2 text-sm font-black text-on-surface disabled:opacity-60"
                    >
                      Decline
                    </button>
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <div className="rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-4 text-sm font-medium text-on-surface-variant">
              {result?.ok ? 'No resource requests found.' : 'Loading requests...'}
            </div>
          )}
        </div>
      </section>
    </PageStack>
  );
}
