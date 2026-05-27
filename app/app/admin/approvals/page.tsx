'use client';

import { useEffect, useMemo, useOptimistic, useState } from 'react';

import { ApiUnavailableBanner } from '@/components/ui/ApiUnavailableBanner';
import { requestJson, type ClientResult } from '@/lib/http/client';
import { toastClientError, toastSuccess } from '@/lib/ui/toast';

type ResourceRequest = {
  id: number;
  requestId: string;
  siteId: string;
  requestType: 'Labour' | 'Materials' | 'Money' | 'Machinery';
  details: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Declined';
  requestedBy: string;
};

type FieldRequest = {
  id: number;
  fieldRequestId: string;
  siteId: string;
  proposedName: string;
  categoryId: string;
  subcategoryId: string | null;
  fieldType: 'Number' | 'Text' | 'Dropdown';
  status: 'Pending' | 'Approved' | 'Declined';
  requestedBy: string;
};

type Transfer = {
  id: number;
  transferId: string;
  fromSiteId: string;
  toSiteId: string;
  resourceType: 'Labour' | 'Materials';
  status: 'Pending' | 'Approved' | 'Declined';
  quantity: string;
  remarks: string | null;
  requestedByUserId: string;
};

type Category = { categoryId: string; name: string };
type Subcategory = { subcategoryId: string; name: string; categoryId: string };

export default function AdminApprovalsPage() {
  const [resourceResult, setResourceResult] = useState<ClientResult<ResourceRequest[]> | null>(null);
  const [fieldResult, setFieldResult] = useState<ClientResult<FieldRequest[]> | null>(null);
  const [transferResult, setTransferResult] = useState<ClientResult<Transfer[]> | null>(null);
  const [categoriesResult, setCategoriesResult] = useState<ClientResult<Category[]> | null>(null);
  const [subcategoryMap, setSubcategoryMap] = useState<Record<string, Subcategory[]>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [mergeCategory, setMergeCategory] = useState<Record<string, string>>({});
  const [mergeSubcategory, setMergeSubcategory] = useState<Record<string, string>>({});

  const [optimisticResource, applyResourceOptimistic] = useOptimistic(
    resourceResult?.ok ? resourceResult.data : ([] as ResourceRequest[]),
    (current, action: { requestId: string; status: 'Approved' | 'Declined' }) =>
      current.map((item) =>
        item.requestId === action.requestId ? { ...item, status: action.status } : item,
      ),
  );
  const [optimisticField, applyFieldOptimistic] = useOptimistic(
    fieldResult?.ok ? fieldResult.data : ([] as FieldRequest[]),
    (current, action: { fieldRequestId: string; status: 'Approved' | 'Declined' }) =>
      current.map((item) =>
        item.fieldRequestId === action.fieldRequestId ? { ...item, status: action.status } : item,
      ),
  );
  const [optimisticTransfer, applyTransferOptimistic] = useOptimistic(
    transferResult?.ok ? transferResult.data : ([] as Transfer[]),
    (current, action: { transferId: string; status: 'Approved' | 'Declined' }) =>
      current.map((item) =>
        item.transferId === action.transferId ? { ...item, status: action.status } : item,
      ),
  );

  async function load() {
    const [resource, field, transfers, categories] = await Promise.all([
      requestJson<ResourceRequest[]>('/api/requests/resource'),
      requestJson<FieldRequest[]>('/api/requests/field'),
      requestJson<Transfer[]>('/api/transfers'),
      requestJson<Category[]>('/api/forms/categories'),
    ]);
    setResourceResult(resource);
    setFieldResult(field);
    setTransferResult(transfers);
    setCategoriesResult(categories);

    if (categories.ok) {
      const rows = await Promise.all(
        categories.data.map(async (c) => {
          const tree = await requestJson<{ subcategories: Array<{ subcategoryId: string; name: string; categoryId: string }> }>(`/api/forms/categories/${c.categoryId}`);
          return { id: c.categoryId, subs: tree.ok ? tree.data.subcategories : [] };
        }),
      );
      const nextMap: Record<string, Subcategory[]> = {};
      for (const row of rows) nextMap[row.id] = row.subs;
      setSubcategoryMap(nextMap);
    }
  }

  useEffect(() => {
    let cancelled = false;
    load().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function reviewResource(requestId: string, status: 'Approved' | 'Declined') {
    applyResourceOptimistic({ requestId, status });
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
      setResourceResult(next as ClientResult<ResourceRequest[]>);
    }
    setPendingId(null);
  }

  async function reviewField(fieldRequestId: string, status: 'Approved' | 'Declined', options?: { mergeTargetCategoryId?: string; mergeTargetSubcategoryId?: string }) {
    applyFieldOptimistic({ fieldRequestId, status });
    setPendingId(fieldRequestId);
    const next = await requestJson(`/api/requests/field/${fieldRequestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        mergeTargetCategoryId: options?.mergeTargetCategoryId,
        mergeTargetSubcategoryId: options?.mergeTargetSubcategoryId,
      }),
    });
    if (next.ok) {
      toastSuccess(`Field request ${status.toLowerCase()}`);
      await load();
    } else {
      toastClientError(next);
      setFieldResult(next as ClientResult<FieldRequest[]>);
    }
    setPendingId(null);
  }

  async function reviewTransfer(transferId: string, status: 'Approved' | 'Declined') {
    applyTransferOptimistic({ transferId, status });
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
      setTransferResult(next as ClientResult<Transfer[]>);
    }
    setPendingId(null);
  }

  const reviewRequests = useMemo(
    () => (fieldResult?.ok ? fieldResult.data.filter((item) => item.proposedName.startsWith('[Category Review]') || item.proposedName.startsWith('[Subcategory Review]')) : []),
    [fieldResult],
  );

  const normalFieldRequests = useMemo(
    () => (fieldResult?.ok ? optimisticField.filter((item) => !item.proposedName.startsWith('[Category Review]') && !item.proposedName.startsWith('[Subcategory Review]')) : []),
    [fieldResult, optimisticField],
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="card-standard p-4">
        <h2 className="text-lg font-bold text-white">Review Queues</h2>
        <p className="text-sm text-on-surface-variant">Resource requests, field requests, transfer requests, and duplicate category reviews.</p>
      </header>

      {resourceResult && !resourceResult.ok && resourceResult.kind === 'endpoint_unavailable' ? (
        <ApiUnavailableBanner endpoint={resourceResult.endpoint} method={resourceResult.method} />
      ) : null}
      {fieldResult && !fieldResult.ok && fieldResult.kind === 'endpoint_unavailable' ? (
        <ApiUnavailableBanner endpoint={fieldResult.endpoint} method={fieldResult.method} />
      ) : null}
      {transferResult && !transferResult.ok && transferResult.kind === 'endpoint_unavailable' ? (
        <ApiUnavailableBanner endpoint={transferResult.endpoint} method={transferResult.method} />
      ) : null}

      <section className="card-standard p-4">
        <h3 className="text-lg font-bold text-on-surface">Category/Subcategory Duplicate Reviews</h3>
        <div className="mt-3 grid gap-3">
          {reviewRequests.map((request) => {
            const isSub = request.proposedName.startsWith('[Subcategory Review]');
            const selectedCategory = mergeCategory[request.fieldRequestId] ?? '';
            const subs = selectedCategory ? (subcategoryMap[selectedCategory] ?? []) : [];
            return (
              <article key={request.fieldRequestId} className="rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-black text-on-surface">{request.proposedName}</div>
                    <div className="text-sm text-on-surface-variant">Site {request.siteId}</div>
                  </div>
                  <span className="rounded-full bg-surface px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-on-surface-variant">{request.status}</span>
                </div>
                {request.status === 'Pending' ? (
                  <div className="mt-3 grid gap-2">
                    <select
                      value={selectedCategory}
                      onChange={(e) => setMergeCategory((prev) => ({ ...prev, [request.fieldRequestId]: e.target.value }))}
                      className="h-10 rounded-xl border border-outline bg-surface-container-lowest px-3"
                    >
                      <option value="">Choose merge category</option>
                      {categoriesResult?.ok ? categoriesResult.data.map((c) => (
                        <option key={c.categoryId} value={c.categoryId}>{c.name}</option>
                      )) : null}
                    </select>
                    {isSub ? (
                      <select
                        value={mergeSubcategory[request.fieldRequestId] ?? ''}
                        onChange={(e) => setMergeSubcategory((prev) => ({ ...prev, [request.fieldRequestId]: e.target.value }))}
                        className="h-10 rounded-xl border border-outline bg-surface-container-lowest px-3"
                      >
                        <option value="">Choose merge subcategory</option>
                        {subs.map((s) => (
                          <option key={s.subcategoryId} value={s.subcategoryId}>{s.name}</option>
                        ))}
                      </select>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" disabled={pendingId === request.fieldRequestId} onClick={() => reviewField(request.fieldRequestId, 'Approved')} className="rounded bg-primary px-4 py-2 text-xs font-semibold uppercase text-on-primary disabled:opacity-60">Approve</button>
                      <button
                        type="button"
                        disabled={pendingId === request.fieldRequestId}
                        onClick={() => reviewField(request.fieldRequestId, 'Declined', {
                          mergeTargetCategoryId: mergeCategory[request.fieldRequestId],
                          mergeTargetSubcategoryId: isSub ? mergeSubcategory[request.fieldRequestId] : undefined,
                        })}
                        className="rounded border border-outline px-4 py-2 text-xs font-semibold uppercase text-on-surface-variant disabled:opacity-60"
                      >
                        Decline + Merge
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
          {reviewRequests.length === 0 ? <p className="text-sm text-on-surface-variant">No duplicate review requests.</p> : null}
        </div>
      </section>

      <section className="grid gap-4">
        <div className="card-standard p-4">
          <h3 className="text-lg font-bold text-on-surface">Resource requests</h3>
          <div className="mt-4 grid gap-3">
            {resourceResult?.ok ? optimisticResource.map((request) => (
              <article key={request.requestId} className="rounded-2xl bg-surface-container-low px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-black text-on-surface">{request.requestType}</div>
                    <div className="text-sm text-on-surface-variant">Site {request.siteId}</div>
                  </div>
                  <span className="rounded-full bg-surface px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-on-surface-variant">{request.status}</span>
                </div>
                <p className="mt-3 text-sm font-medium text-on-surface">{request.details}</p>
                {request.status === 'Pending' ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" disabled={pendingId === request.requestId} onClick={() => reviewResource(request.requestId, 'Approved')} className="rounded bg-primary px-4 py-2 text-xs font-semibold uppercase text-on-primary disabled:opacity-60">Approve</button>
                    <button type="button" disabled={pendingId === request.requestId} onClick={() => reviewResource(request.requestId, 'Declined')} className="rounded border border-outline px-4 py-2 text-xs font-semibold uppercase text-on-surface-variant disabled:opacity-60">Decline</button>
                  </div>
                ) : null}
              </article>
            )) : null}
          </div>
        </div>

        <div className="card-standard p-4">
          <h3 className="text-lg font-bold text-on-surface">Field requests</h3>
          <div className="mt-4 grid gap-3">
            {normalFieldRequests.map((request) => (
              <article key={request.fieldRequestId} className="rounded-2xl bg-surface-container-low px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-black text-on-surface">{request.proposedName}</div>
                    <div className="text-sm text-on-surface-variant">Site {request.siteId}</div>
                  </div>
                  <span className="rounded-full bg-surface px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-on-surface-variant">{request.status}</span>
                </div>
                <div className="mt-3 text-sm font-medium text-on-surface-variant">Type: {request.fieldType} • Category: {request.categoryId}</div>
                {request.status === 'Pending' ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" disabled={pendingId === request.fieldRequestId} onClick={() => reviewField(request.fieldRequestId, 'Approved')} className="rounded bg-primary px-4 py-2 text-xs font-semibold uppercase text-on-primary disabled:opacity-60">Approve</button>
                    <button type="button" disabled={pendingId === request.fieldRequestId} onClick={() => reviewField(request.fieldRequestId, 'Declined')} className="rounded border border-outline px-4 py-2 text-xs font-semibold uppercase text-on-surface-variant disabled:opacity-60">Decline</button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>

        <div className="card-standard p-4">
          <h3 className="text-lg font-bold text-on-surface">Transfer requests</h3>
          <div className="mt-4 grid gap-3">
            {transferResult?.ok ? optimisticTransfer.map((transfer) => (
              <article key={transfer.transferId} className="rounded-2xl bg-surface-container-low px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-black text-on-surface">{transfer.resourceType} Transfer</div>
                    <div className="text-sm text-on-surface-variant">{transfer.fromSiteId} → {transfer.toSiteId}</div>
                  </div>
                  <span className="rounded-full bg-surface px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-on-surface-variant">{transfer.status}</span>
                </div>
                <p className="mt-3 text-sm font-medium text-on-surface">Qty: {transfer.quantity}{transfer.remarks ? ` • ${transfer.remarks}` : ''}</p>
                {transfer.status === 'Pending' ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" disabled={pendingId === transfer.transferId} onClick={() => reviewTransfer(transfer.transferId, 'Approved')} className="rounded bg-primary px-4 py-2 text-xs font-semibold uppercase text-on-primary disabled:opacity-60">Approve</button>
                    <button type="button" disabled={pendingId === transfer.transferId} onClick={() => reviewTransfer(transfer.transferId, 'Declined')} className="rounded border border-outline px-4 py-2 text-xs font-semibold uppercase text-on-surface-variant disabled:opacity-60">Decline</button>
                  </div>
                ) : null}
              </article>
            )) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
