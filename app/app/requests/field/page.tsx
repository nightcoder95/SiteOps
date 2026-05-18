'use client';

import { useEffect, useState } from 'react';

import { ApiUnavailableBanner } from '@/components/ui/ApiUnavailableBanner';
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

const labelClass = 'font-label-md text-label-md uppercase text-on-surface-variant';
const inputClass =
  'h-11 w-full rounded border border-outline bg-surface-container-lowest px-3 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';

function statusChip(status: FieldRequest['status']) {
  switch (status) {
    case 'Approved':
      return 'bg-primary-container text-on-primary-container';
    case 'Declined':
      return 'bg-error-container text-on-error-container';
    default:
      return 'bg-secondary-container text-on-secondary-container';
  }
}

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
      form.reset();
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
    const next = await requestJson(`/api/requests/field/${id}`, { method: 'DELETE' });
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
    <div className="space-y-5 pb-20">
      <header>
        <h2 className="text-2xl font-extrabold tracking-tight text-on-surface">Field Requests</h2>
        <p className="text-sm text-on-surface-variant">
          Propose new fields and review pending requests.
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
        <h3 className="text-lg font-extrabold tracking-tight text-on-surface">Propose a Field</h3>
        <div className="flex flex-col gap-2">
          <label htmlFor="siteId" className={labelClass}>Site ID</label>
          <input id="siteId" name="siteId" required className={inputClass} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="proposedName" className={labelClass}>Proposed Name</label>
          <input id="proposedName" name="proposedName" required className={inputClass} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="categoryId" className={labelClass}>Category ID</label>
          <input id="categoryId" name="categoryId" required className={inputClass} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="subcategoryId" className={labelClass}>Subcategory ID (optional)</label>
          <input id="subcategoryId" name="subcategoryId" className={inputClass} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="fieldType" className={labelClass}>Field Type</label>
          <select id="fieldType" name="fieldType" defaultValue="Text" className={inputClass}>
            <option value="Text">Text</option>
            <option value="Number">Number</option>
            <option value="Dropdown">Dropdown</option>
          </select>
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
              {result?.ok ? 'No field requests found.' : 'Loading…'}
            </div>
          ) : (
            items.map((request) => (
              <article key={request.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-body-md text-body-md font-semibold text-on-surface">{request.proposedName}</div>
                    <div className="font-label-sm text-label-sm mt-0.5 text-on-surface-variant">Site {request.siteId}</div>
                  </div>
                  <span className={`rounded-full px-2 py-1 font-label-md text-label-md uppercase ${statusChip(request.status)}`}>
                    {request.status}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 rounded-lg bg-surface-container-low p-3 font-label-sm text-label-sm">
                  <div>
                    <div className={labelClass}>Type</div>
                    <div className="text-on-surface">{request.fieldType}</div>
                  </div>
                  <div>
                    <div className={labelClass}>Category</div>
                    <div className="text-on-surface">{request.categoryId}</div>
                  </div>
                  <div>
                    <div className={labelClass}>Subcat</div>
                    <div className="text-on-surface">{request.subcategoryId ?? '—'}</div>
                  </div>
                </div>
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
                    <button
                      type="button"
                      disabled={pendingId === request.id}
                      onClick={() => withdraw(request.id)}
                      className="flex h-9 items-center gap-1 rounded px-3 font-label-md text-label-md uppercase text-on-surface-variant hover:bg-surface-container disabled:opacity-60"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>undo</span>
                      Withdraw
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
