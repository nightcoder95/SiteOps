'use client';

// Route contract: /app/forms/subcategory (Supervisor/Admin)

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { ApiUnavailableBanner } from '@/components/ui/ApiUnavailableBanner';
import { requestJson, type ClientResult } from '@/lib/http/client';
import { buildFormsSelectionHref, parseSubcategoryStepParams } from '@/lib/navigation/formsFlow';

type Field = {
  id: number;
  fieldDefinitionId: string;
  label: string;
  fieldType: 'Number' | 'Text' | 'Dropdown';
  unit: string | null;
  options: unknown;
};

type CategoryDetail = {
  id: number;
  categoryId: string;
  name: string;
  subcategories: Array<{
    id: number;
    subcategoryId: string;
    name: string;
    fields: Field[];
  }>;
};

type SimilarityResult = {
  candidates: Array<{ id: string | number; name: string; score: number; band: "high" | "medium" }>;
  topScore: number;
  recommendedAction: "use_existing" | "create_new";
};

export function SubcategoryStepClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const parsed = useMemo(() => parseSubcategoryStepParams(searchParams), [searchParams]);
  const [result, setResult] = useState<ClientResult<CategoryDetail> | null>(null);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [warning, setWarning] = useState<SimilarityResult | null>(null);

  useEffect(() => {
    if (!parsed.ok) {
      router.replace(parsed.redirectTo);
    }
  }, [parsed, router]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!parsed.ok) return;
      const next = await requestJson<CategoryDetail>(`/api/forms/categories/${parsed.categoryId}`);
      if (!cancelled) setResult(next);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [parsed]);

  const flow = parsed.ok ? parsed : null;

  if (!flow) {
    return <div className="rounded-3xl border border-outline-variant bg-surface px-4 py-6 text-sm font-medium text-on-surface-variant">Redirecting...</div>;
  }

  const detail = result?.ok ? result.data : null;

  async function doCreateSubcategory(name: string, overrideDuplicateWarning: boolean) {
    if (!flow) return;
    const created = await requestJson<{ id: number; subcategoryId: string; name: string }>('/api/forms/subcategories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categoryId: flow.categoryId,
        name,
        overrideDuplicateWarning,
      }),
    });
    if (!created.ok) {
      setCreateError(created.message);
      return;
    }

    router.push(
      buildFormsSelectionHref('new', {
        siteId: flow.siteId,
        categoryId: flow.categoryId,
        subcategoryId: created.data.subcategoryId,
      }),
    );
  }

  async function onCreateSubcategory(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = createName.trim();
    if (!name) return;

    setCreateError(null);
    setCreating(true);
    if (!flow) return;
    const similar = await requestJson<SimilarityResult>('/api/forms/subcategories/similar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId: flow.categoryId, name }),
    });
    if (!similar.ok) {
      setCreateError(similar.message);
      setCreating(false);
      return;
    }

    if (similar.data.candidates.length > 0) {
      setWarning(similar.data);
      setCreating(false);
      return;
    }

    await doCreateSubcategory(name, false);
    setCreating(false);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[2rem] bg-[linear-gradient(135deg,#fff7ed_0%,#fff_55%,#e2e8f0_100%)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-on-surface-variant">Step 3 of 4</p>
        <h2 className="mt-2 text-2xl font-black text-on-surface">{detail?.name ?? 'Choose a subcategory'}</h2>
        <p className="mt-2 max-w-2xl text-sm font-medium text-on-surface-variant">The flow is now anchored to site {flow.siteId} and category {flow.categoryId}.</p>
      </section>

      {result && !result.ok && result.kind === 'endpoint_unavailable' ? (
        <ApiUnavailableBanner endpoint={result.endpoint} method={result.method} />
      ) : null}

      {result && !result.ok && result.kind !== 'endpoint_unavailable' ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          {result.message}
        </div>
      ) : null}

      <section className="grid gap-3">
        <form onSubmit={onCreateSubcategory} className="rounded-[1.75rem] border border-outline-variant bg-surface p-4 shadow-sm">
          <h3 className="text-base font-black text-on-surface">Add subcategory</h3>
          <div className="mt-3 grid gap-2">
            <input
              value={createName}
              onChange={(e) => {
                setCreateName(e.target.value);
                setWarning(null);
              }}
              required
              placeholder="Subcategory name"
              className="rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm"
            />
            <button disabled={creating} type="submit" className="rounded-xl bg-machined-gradient px-4 py-2 text-sm font-black text-white disabled:opacity-60">
              {creating ? 'Checking...' : '+ Add subcategory'}
            </button>
            {createError ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">{createError}</p>
            ) : null}
          </div>
          {warning ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-amber-900">Similar subcategories found</p>
              <div className="mt-2 grid gap-2">
                {warning.candidates.map((candidate) => (
                  <div key={String(candidate.id)} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-2 text-xs">
                    <div>
                      <p className="font-bold text-on-surface">{candidate.name}</p>
                      <p className="text-on-surface-variant">Score {(candidate.score * 100).toFixed(0)}%</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          buildFormsSelectionHref('new', {
                            siteId: flow!.siteId,
                            categoryId: flow!.categoryId,
                            subcategoryId: String(candidate.id),
                          }),
                        )
                      }
                      className="rounded-lg bg-surface-container-low px-2 py-1 font-bold text-on-surface"
                    >
                      Use existing
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={async () => {
                  setCreating(true);
                  await doCreateSubcategory(createName.trim(), true);
                  setCreating(false);
                }}
                className="mt-2 rounded-lg bg-machined-gradient px-3 py-2 text-xs font-black text-white"
              >
                Create anyway
              </button>
            </div>
          ) : null}
        </form>

        {detail?.subcategories?.length ? (
          detail.subcategories.map((subcategory) => (
            <Link
              key={subcategory.subcategoryId}
              href={buildFormsSelectionHref('new', {
                siteId: flow!.siteId,
                categoryId: flow!.categoryId,
                subcategoryId: subcategory.subcategoryId,
              })}
              className="rounded-[1.75rem] border border-outline-variant bg-surface p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)] active-press"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black text-on-surface">{subcategory.name}</h3>
                  <p className="mt-1 text-sm font-medium text-on-surface-variant">{subcategory.fields.length} field{subcategory.fields.length === 1 ? '' : 's'}</p>
                </div>
                <span className="rounded-full bg-machined-gradient px-3 py-1 text-[10px] font-black uppercase tracking-[0.28em] text-white">
                  Build
                </span>
              </div>
            </Link>
          ))
        ) : (
          <div className="rounded-3xl border border-outline-variant bg-surface px-4 py-6 text-sm font-medium text-on-surface-variant">
            {result?.ok ? 'No subcategories available.' : 'Loading subcategories...'}
          </div>
        )}
      </section>
    </div>
  );
}
