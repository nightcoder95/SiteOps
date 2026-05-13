'use client';

// Route contract: /app/forms/category (Supervisor/Admin)

import Link from 'next/link';
import { Box, Factory, HardHat, Plus, ReceiptText, Siren } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { ApiUnavailableBanner } from '@/components/ui/ApiUnavailableBanner';
import { requestJson, type ClientResult } from '@/lib/http/client';
import { buildFormsSelectionHref, parseCategoryStepParams } from '@/lib/navigation/formsFlow';

type Category = {
  id: number;
  categoryId: string;
  name: string;
};

type SimilarityResult = {
  candidates: Array<{ id: string | number; name: string; score: number; band: "high" | "medium" }>;
  topScore: number;
  recommendedAction: "use_existing" | "create_new";
};

export function CategoryStepClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const parsed = useMemo(() => parseCategoryStepParams(searchParams), [searchParams]);
  const [result, setResult] = useState<ClientResult<Category[]> | null>(null);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [warning, setWarning] = useState<SimilarityResult | null>(null);
  function iconFor(name: string) {
    const n = name.toLowerCase();
    if (n.includes('labour')) return HardHat;
    if (n.includes('material')) return Box;
    if (n.includes('machinery')) return Factory;
    if (n.includes('expense') || n.includes('financial')) return ReceiptText;
    if (n.includes('incident')) return Siren;
    return Box;
  }

  useEffect(() => {
    if (!parsed.ok) {
      router.replace(parsed.redirectTo);
    }
  }, [parsed, router]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!parsed.ok) return;
      const next = await requestJson<Category[]>('/api/forms/categories');
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

  async function doCreateCategory(name: string, overrideDuplicateWarning: boolean) {
    if (!flow) return;
    const created = await requestJson<Category>('/api/forms/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, overrideDuplicateWarning }),
    });
    if (!created.ok) {
      setCreateError(created.message);
      return;
    }

    const refreshed = await requestJson<Category[]>('/api/forms/categories');
    setResult(refreshed);
    const categoryId = created.data.categoryId;
    router.push(buildFormsSelectionHref('subcategory', { siteId: flow.siteId, categoryId }));
  }

  async function onCreateCategory(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = createName.trim();
    if (!name) return;

    setCreateError(null);
    setCreating(true);
    const similar = await requestJson<SimilarityResult>('/api/forms/categories/similar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
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

    await doCreateCategory(name, false);
    setCreating(false);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[2rem] bg-[linear-gradient(135deg,#fff7ed_0%,#fff_55%,#e2e8f0_100%)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-on-surface-variant">Step 2 of 4</p>
        <h2 className="mt-2 text-2xl font-black text-on-surface">Choose a category</h2>
        <p className="mt-2 max-w-2xl text-sm font-medium text-on-surface-variant">Site context is locked. Now choose the entry category.</p>
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
        <form onSubmit={onCreateCategory} className="rounded-[1.75rem] border border-outline-variant bg-surface p-4 shadow-sm">
          <h3 className="text-base font-black text-on-surface">Add category</h3>
          <div className="mt-3 grid gap-2">
            <input
              id="category-create-input"
              value={createName}
              onChange={(e) => {
                setCreateName(e.target.value);
                setWarning(null);
              }}
              name="name"
              required
              placeholder="Category name (e.g. Machinery)"
              className="rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm"
            />
            <button disabled={creating} type="submit" className="rounded-xl bg-machined-gradient px-4 py-2 text-sm font-black text-white disabled:opacity-60">
              {creating ? 'Checking...' : '+ Add category'}
            </button>
            {createError ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">{createError}</p>
            ) : null}
          </div>
          {warning ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-amber-900">Similar categories found</p>
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
                          buildFormsSelectionHref('subcategory', {
                            siteId: flow!.siteId,
                            categoryId: String(candidate.id),
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
                  await doCreateCategory(createName.trim(), true);
                  setCreating(false);
                }}
                className="mt-2 rounded-lg bg-machined-gradient px-3 py-2 text-xs font-black text-white"
              >
                Create anyway
              </button>
            </div>
          ) : null}
        </form>

        {result?.ok ? (
          result.data.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {result.data.map((category) => {
                const Icon = iconFor(category.name);
                return (
              <Link
                key={category.categoryId}
                href={buildFormsSelectionHref('subcategory', {
                  siteId: flow!.siteId,
                  categoryId: category.categoryId,
                })}
                className="rounded-[1.75rem] border border-outline-variant bg-surface p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)] active-press"
              >
                <div className="flex min-h-[170px] flex-col items-center justify-center gap-5 text-center">
                  <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary-container text-primary">
                    <Icon className="h-10 w-10" />
                  </span>
                  <h3 className="text-lg font-black uppercase tracking-[0.25em] text-on-surface-variant">{category.name}</h3>
                </div>
              </Link>
                );
              })}
              <button
                type="button"
                onClick={() => document.getElementById('category-create-input')?.focus()}
                className="rounded-[1.75rem] border border-dashed border-primary/30 bg-primary-container/20 p-6 shadow-[0_10px_30px_rgba(15,23,42,0.05)] active-press"
              >
                <div className="flex min-h-[170px] flex-col items-center justify-center gap-5 text-center">
                  <span className="flex h-20 w-20 items-center justify-center rounded-3xl border border-primary/30 bg-surface text-primary">
                    <Plus className="h-10 w-10" />
                  </span>
                  <h3 className="text-lg font-black uppercase tracking-[0.25em] text-primary">Propose Category</h3>
                </div>
              </button>
            </div>
          ) : (
            <div className="rounded-3xl border border-outline-variant bg-surface px-4 py-6 text-sm font-medium text-on-surface-variant">
              No categories available.
            </div>
          )
        ) : (
          <div className="rounded-3xl border border-outline-variant bg-surface px-4 py-6 text-sm font-medium text-on-surface-variant">
            Loading categories...
          </div>
        )}
      </section>
    </div>
  );
}
