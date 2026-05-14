'use client';

import { useEffect, useState } from 'react';

import { ApiUnavailableBanner } from '@/components/ui/ApiUnavailableBanner';
import { PageHero, PageStack } from '@/components/ui/page-primitives';
import { requestJson, type ClientResult } from '@/lib/http/client';
import { toastClientError, toastSuccess } from '@/lib/ui/toast';

type FieldRequest = {
  id: string;
  siteId: string;
  proposedName: string;
  categoryId: string;
  subcategoryId: string | null;
  fieldType: 'Number' | 'Text' | 'Dropdown';
  status: 'Pending' | 'Approved' | 'Declined';
  requestedBy: string;
};

export default function FieldRequestsPage() {
  const [result, setResult] = useState<ClientResult<FieldRequest[]> | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function load() {
    const next = await requestJson<FieldRequest[]>('/api/requests/field');
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

    const payload: Record<string, string> = {
      siteId: String(fd.get('siteId') ?? ''),
      proposedName: String(fd.get('proposedName') ?? ''),
      categoryId: String(fd.get('categoryId') ?? ''),
      fieldType: String(fd.get('fieldType') ?? ''),
    };
    const subcategoryId = String(fd.get('subcategoryId') ?? '').trim();
    if (subcategoryId) payload.subcategoryId = subcategoryId;

    const next = await requestJson<FieldRequest>('/api/requests/field', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (next.ok) {
      toastSuccess('Field request submitted');
      e.currentTarget.reset();
      await load();
      return;
    }

    toastClientError(next);
    setResult(next);
  }

  async function review(id: string, nextStatus: 'Approved' | 'Declined') {
    setPendingId(id);
    const next = await requestJson<FieldRequest>(`/api/requests/field/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });

    if (next.ok) {
      toastSuccess(`Field request ${nextStatus.toLowerCase()}`);
      await load();
    } else {
      toastClientError(next);
      setResult(next);
    }
    setPendingId(null);
  }

  async function withdraw(id: string) {
    setPendingId(id);
    const next = await requestJson(`/api/requests/field/${id}`, {
      method: 'DELETE',
    });
    if (next.ok) {
      toastSuccess('Field request withdrawn');
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
        eyebrow="Field Requests"
        title="Proposed field definitions"
        description="Supervisors can propose fields and admins can approve or decline them from the same live queue."
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
        <h3 className="text-lg font-black text-on-surface">Propose a field</h3>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-2 text-sm font-semibold text-on-surface">
            Site Id
            <input name="siteId" required className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface" />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-on-surface">
            Proposed name
            <input name="proposedName" required className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface" />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-on-surface">
            Category Id
            <input name="categoryId" required className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface" />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-on-surface">
            Subcategory Id (optional)
            <input name="subcategoryId" className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface" />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-on-surface">
            Field Type
            <select name="fieldType" defaultValue="Text" className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface">
              <option value="Text">Text</option>
              <option value="Number">Number</option>
              <option value="Dropdown">Dropdown</option>
            </select>
          </label>
          <button type="submit" className="rounded-full bg-machined-gradient px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary/20">
            Submit
          </button>
        </div>
      </form>

      <section className="rounded-[1.75rem] border border-outline-variant bg-surface p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-black text-on-surface">Field request queue</h3>
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
                    <div className="text-base font-black text-on-surface">{request.proposedName}</div>
                    <div className="text-sm text-on-surface-variant">Site {request.siteId}</div>
                  </div>
                  <span className="rounded-full bg-surface px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-on-surface-variant">
                    {request.status}
                  </span>
                </div>
                <div className="mt-3 grid gap-1 text-sm font-medium text-on-surface-variant">
                  <span>Field type: {request.fieldType}</span>
                  <span>Category: {request.categoryId}</span>
                  <span>Subcategory: {request.subcategoryId ?? '—'}</span>
                </div>
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
                    <button
                      type="button"
                      disabled={pendingId === request.id}
                      onClick={() => withdraw(request.id)}
                      className="rounded-full bg-surface-container-low px-4 py-2 text-sm font-black text-on-surface disabled:opacity-60"
                    >
                      Withdraw
                    </button>
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <div className="rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-4 text-sm font-medium text-on-surface-variant">
              {result?.ok ? 'No field requests found.' : 'Loading requests...'}
            </div>
          )}
        </div>
      </section>
    </PageStack>
  );
}
