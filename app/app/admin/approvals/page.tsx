'use client';

import { useEffect, useOptimistic, useState } from 'react';

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

export default function AdminApprovalsPage() {
  const [resourceResult, setResourceResult] = useState<ClientResult<ResourceRequest[]> | null>(null);
  const [fieldResult, setFieldResult] = useState<ClientResult<FieldRequest[]> | null>(null);
  const [transferResult, setTransferResult] = useState<ClientResult<Transfer[]> | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
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
    const [resource, field, transfers] = await Promise.all([
      requestJson<ResourceRequest[]>('/api/requests/resource'),
      requestJson<FieldRequest[]>('/api/requests/field'),
      requestJson<Transfer[]>('/api/transfers'),
    ]);
    setResourceResult(resource);
    setFieldResult(field);
    setTransferResult(transfers);
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

  async function reviewField(fieldRequestId: string, status: 'Approved' | 'Declined') {
    applyFieldOptimistic({ fieldRequestId, status });
    setPendingId(fieldRequestId);
    const next = await requestJson(`/api/requests/field/${fieldRequestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
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

  return (
    <div className="flex flex-col gap-density-medium">
      <header>
        <h2 className="font-headline-sm text-headline-sm text-on-background">Review Queues</h2>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Resource requests, field requests, and site-to-site transfers.
        </p>
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

      <section className="grid gap-4">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
          <h3 className="font-headline-sm text-headline-sm text-on-surface">Resource requests</h3>
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
                    <button type="button" disabled={pendingId === request.requestId} onClick={() => reviewResource(request.requestId, 'Approved')} className="rounded bg-primary px-4 py-2 font-label-md text-label-md uppercase text-on-primary disabled:opacity-60">Approve</button>
                    <button type="button" disabled={pendingId === request.requestId} onClick={() => reviewResource(request.requestId, 'Declined')} className="rounded border border-outline px-4 py-2 font-label-md text-label-md uppercase text-on-surface-variant disabled:opacity-60">Decline</button>
                  </div>
                ) : null}
              </article>
            )) : null}
          </div>
        </div>

        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
          <h3 className="font-headline-sm text-headline-sm text-on-surface">Field requests</h3>
          <div className="mt-4 grid gap-3">
            {fieldResult?.ok ? optimisticField.map((request) => (
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
                    <button type="button" disabled={pendingId === request.fieldRequestId} onClick={() => reviewField(request.fieldRequestId, 'Approved')} className="rounded bg-primary px-4 py-2 font-label-md text-label-md uppercase text-on-primary disabled:opacity-60">Approve</button>
                    <button type="button" disabled={pendingId === request.fieldRequestId} onClick={() => reviewField(request.fieldRequestId, 'Declined')} className="rounded border border-outline px-4 py-2 font-label-md text-label-md uppercase text-on-surface-variant disabled:opacity-60">Decline</button>
                  </div>
                ) : null}
              </article>
            )) : null}
          </div>
        </div>

        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
          <h3 className="font-headline-sm text-headline-sm text-on-surface">Transfer requests</h3>
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
                    <button type="button" disabled={pendingId === transfer.transferId} onClick={() => reviewTransfer(transfer.transferId, 'Approved')} className="rounded bg-primary px-4 py-2 font-label-md text-label-md uppercase text-on-primary disabled:opacity-60">Approve</button>
                    <button type="button" disabled={pendingId === transfer.transferId} onClick={() => reviewTransfer(transfer.transferId, 'Declined')} className="rounded border border-outline px-4 py-2 font-label-md text-label-md uppercase text-on-surface-variant disabled:opacity-60">Decline</button>
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
