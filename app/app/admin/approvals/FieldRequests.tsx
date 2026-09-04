'use client';

import { useEffect, useMemo, useOptimistic, useState } from 'react';

import { ApiUnavailableBanner } from '@/components/ui/ApiUnavailableBanner';
import { requestJson, type ClientResult } from '@/lib/http/client';
import { toastClientError, toastSuccess } from '@/lib/ui/toast';

export type FieldRequest = {
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

type Category = { categoryId: string; name: string };
type Subcategory = { subcategoryId: string; name: string; categoryId: string };

const REVIEW_PREFIXES = ['[Category Review]', '[Subcategory Review]'] as const;

function isDuplicateReview(request: FieldRequest) {
  return REVIEW_PREFIXES.some((prefix) => request.proposedName.startsWith(prefix));
}

// Extracted from the approvals page (audit F12). Owns BOTH field-request
// surfaces because they read the same list: the duplicate-review queue (which
// also needs the category tree for merge targets) and the ordinary field
// requests. Endpoints, methods, bodies and toast copy are the originals.
export function FieldRequests({ initialRequests }: { initialRequests: FieldRequest[] }) {
  // Seeded from the server render so the queue is in the first paint (audit
  // F16); the mount-time load() below still revalidates.
  const [result, setResult] = useState<ClientResult<FieldRequest[]> | null>(
    { ok: true, data: initialRequests, status: 200 } as ClientResult<FieldRequest[]>,
  );
  const [categoriesResult, setCategoriesResult] = useState<ClientResult<Category[]> | null>(null);
  const [subcategoryMap, setSubcategoryMap] = useState<Record<string, Subcategory[]>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [mergeCategory, setMergeCategory] = useState<Record<string, string>>({});
  const [mergeSubcategory, setMergeSubcategory] = useState<Record<string, string>>({});

  const [optimistic, applyOptimistic] = useOptimistic(
    result?.ok ? result.data : ([] as FieldRequest[]),
    (current, action: { fieldRequestId: string; status: 'Approved' | 'Declined' }) =>
      current.map((item) =>
        item.fieldRequestId === action.fieldRequestId ? { ...item, status: action.status } : item,
      ),
  );

  async function load() {
    const [field, categories] = await Promise.all([
      requestJson<FieldRequest[]>('/api/requests/field'),
      requestJson<Category[]>('/api/forms/categories'),
    ]);
    setResult(field);
    setCategoriesResult(categories);

    if (categories.ok) {
      const rows = await Promise.all(
        categories.data.map(async (category) => {
          const tree = await requestJson<{ subcategories: Subcategory[] }>(
            `/api/forms/categories/${category.categoryId}`,
          );
          return { id: category.categoryId, subs: tree.ok ? tree.data.subcategories : [] };
        }),
      );
      const nextMap: Record<string, Subcategory[]> = {};
      for (const row of rows) nextMap[row.id] = row.subs;
      setSubcategoryMap(nextMap);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function review(
    fieldRequestId: string,
    status: 'Approved' | 'Declined',
    options?: { mergeTargetCategoryId?: string; mergeTargetSubcategoryId?: string },
  ) {
    applyOptimistic({ fieldRequestId, status });
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
      setResult(next as ClientResult<FieldRequest[]>);
    }
    setPendingId(null);
  }

  // The duplicate-review queue reads the server list (not the optimistic one),
  // matching the original page.
  const reviewRequests = useMemo(
    () => (result?.ok ? result.data.filter(isDuplicateReview) : []),
    [result],
  );

  const normalRequests = useMemo(
    () => (result?.ok ? optimistic.filter((item) => !isDuplicateReview(item)) : []),
    [result, optimistic],
  );

  return (
    <>
      {result && !result.ok && result.kind === 'endpoint_unavailable' ? (
        <ApiUnavailableBanner endpoint={result.endpoint} method={result.method} />
      ) : null}

      <section className="card-standard p-4">
        <h3 className="text-lg font-bold text-slate-100">Category/Subcategory Duplicate Reviews</h3>
        <div className="mt-3 grid gap-3">
          {reviewRequests.map((request) => {
            const isSub = request.proposedName.startsWith('[Subcategory Review]');
            const selectedCategory = mergeCategory[request.fieldRequestId] ?? '';
            const subs = selectedCategory ? (subcategoryMap[selectedCategory] ?? []) : [];
            return (
              <article key={request.fieldRequestId} className="rounded-2xl border border-white/5 bg-slate-900/40 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-black text-slate-100">{request.proposedName}</div>
                    <div className="text-sm text-slate-400">Site {request.siteId}</div>
                  </div>
                  <span className="badge-sky">{request.status}</span>
                </div>
                {request.status === 'Pending' ? (
                  <div className="mt-3 grid gap-2">
                    <select
                      value={selectedCategory}
                      onChange={(e) => setMergeCategory((prev) => ({ ...prev, [request.fieldRequestId]: e.target.value }))}
                      className="input-standard h-11"
                    >
                      <option value="">Choose merge category</option>
                      {categoriesResult?.ok ? categoriesResult.data.map((category) => (
                        <option key={category.categoryId} value={category.categoryId}>{category.name}</option>
                      )) : null}
                    </select>
                    {isSub ? (
                      <select
                        value={mergeSubcategory[request.fieldRequestId] ?? ''}
                        onChange={(e) => setMergeSubcategory((prev) => ({ ...prev, [request.fieldRequestId]: e.target.value }))}
                        className="input-standard h-11"
                      >
                        <option value="">Choose merge subcategory</option>
                        {subs.map((sub) => (
                          <option key={sub.subcategoryId} value={sub.subcategoryId}>{sub.name}</option>
                        ))}
                      </select>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={pendingId === request.fieldRequestId}
                        onClick={() => review(request.fieldRequestId, 'Approved')}
                        className="btn-primary min-h-11 px-5"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={pendingId === request.fieldRequestId}
                        onClick={() => review(request.fieldRequestId, 'Declined', {
                          mergeTargetCategoryId: mergeCategory[request.fieldRequestId],
                          mergeTargetSubcategoryId: isSub ? mergeSubcategory[request.fieldRequestId] : undefined,
                        })}
                        className="btn-secondary min-h-11 px-5 disabled:opacity-50"
                      >
                        Decline + Merge
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
          {reviewRequests.length === 0 ? (
            <p className="text-sm text-slate-400">No duplicate review requests.</p>
          ) : null}
        </div>
      </section>

      <div className="card-standard p-4">
        <h3 className="text-lg font-bold text-slate-100">Field requests</h3>
        <div className="mt-4 grid gap-3">
          {normalRequests.map((request) => (
            <article key={request.fieldRequestId} className="rounded-2xl border border-white/5 bg-slate-900/40 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-base font-black text-slate-100">{request.proposedName}</div>
                  <div className="text-sm text-slate-400">Site {request.siteId}</div>
                </div>
                <span className="badge-sky">{request.status}</span>
              </div>
              <div className="mt-3 text-sm font-medium text-slate-400">
                Type: {request.fieldType} • Category: {request.categoryId}
              </div>
              {request.status === 'Pending' ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pendingId === request.fieldRequestId}
                    onClick={() => review(request.fieldRequestId, 'Approved')}
                    className="btn-primary min-h-11 px-5"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={pendingId === request.fieldRequestId}
                    onClick={() => review(request.fieldRequestId, 'Declined')}
                    className="btn-secondary min-h-11 px-5 disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              ) : null}
            </article>
          ))}
          {normalRequests.length === 0 ? (
            <p className="text-sm text-slate-400">No field requests.</p>
          ) : null}
        </div>
      </div>
    </>
  );
}
