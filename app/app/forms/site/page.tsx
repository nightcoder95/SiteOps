'use client';

// Route contract: /app/forms/site (Supervisor/Admin)

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiUnavailableBanner } from '@/components/ui/ApiUnavailableBanner';
import { requestJson, type ClientResult } from '@/lib/http/client';
import { buildFormsSelectionHref } from '@/lib/navigation/formsFlow';

type Site = {
  id: number;
  siteId: string;
  name: string;
  location: string;
  status: string;
  budget: string | null;
  currentProgress: number | null;
  currentPhase: string | null;
  supervisorId: string;
};

function money(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(numeric);
}

export default function SiteStepPage() {
  const router = useRouter();
  const [result, setResult] = useState<ClientResult<Site[]> | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const next = await requestJson<Site[]>('/api/sites');
      if (!cancelled) setResult(next);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function createSite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setCreateError(null);
    setCreating(true);

    const payload = {
      name: String(fd.get("name") ?? "").trim(),
      location: String(fd.get("location") ?? "").trim(),
      budget: fd.get("budget") ? Number(fd.get("budget")) : undefined,
      currentPhase: String(fd.get("currentPhase") ?? "").trim() || undefined,
      status: "In Progress" as const,
    };

    const created = await requestJson<Site>("/api/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!created.ok) {
      setCreateError(created.message);
      setCreating(false);
      return;
    }

    const refreshed = await requestJson<Site[]>('/api/sites');
    setResult(refreshed);
    setCreating(false);
    if (refreshed.ok) {
      const site = refreshed.data.find((item) => item.siteId === created.data.siteId) ?? created.data;
      router.push(buildFormsSelectionHref('category', { siteId: site.siteId }));
    }
  }

  const title = useMemo(() => {
    if (result?.ok && result.data.length > 0) {
      return `${result.data.length} live sites`;
    }
    return 'Pick the site that the entry belongs to';
  }, [result]);

  return (
    <div className="space-y-4">
      <section className="rounded-[2rem] bg-[linear-gradient(135deg,#fff7ed_0%,#fff_55%,#e2e8f0_100%)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-on-surface-variant">Step 1 of 4</p>
        <h2 className="mt-2 text-5xl font-headline font-black uppercase leading-[0.95] text-on-surface">Select Active Sector For Registry.</h2>
        <p className="mt-2 max-w-2xl text-sm font-medium text-on-surface-variant">{title}</p>
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
        <form onSubmit={createSite} className="rounded-[1.75rem] border border-outline-variant bg-surface p-4 shadow-sm">
          <h3 className="text-base font-black text-on-surface">Add site</h3>
          <div className="mt-3 grid gap-2">
            <input name="name" required placeholder="Site name" className="rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm" />
            <input name="location" required placeholder="Location" className="rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm" />
            <input name="budget" required type="number" min={1} step="0.01" placeholder="Budget" className="rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm" />
            <input name="currentPhase" placeholder="Current phase (optional)" className="rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm" />
            <button disabled={creating} type="submit" className="rounded-xl bg-machined-gradient px-4 py-2 text-sm font-black text-white disabled:opacity-60">
              {creating ? "Creating..." : "+ Add site"}
            </button>
            {createError ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">{createError}</p>
            ) : null}
          </div>
        </form>

        {result?.ok ? (
          result.data.length > 0 ? (
            result.data.map((site) => (
              <article key={site.siteId} className="rounded-[1.75rem] border border-outline-variant bg-surface p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-black text-on-surface">{site.name}</h3>
                    <p className="mt-1 text-sm font-medium text-on-surface-variant">{site.location}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-primary-container px-3 py-1 text-[10px] font-black uppercase tracking-[0.28em] text-primary">
                    {site.status}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl bg-surface-container-low px-3 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.24em] text-on-surface-variant">Budget</div>
                    <div className="mt-1 font-black text-on-surface">{site.budget ? `₹${money(site.budget)}` : '—'}</div>
                  </div>
                  <div className="rounded-2xl bg-surface-container-low px-3 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.24em] text-on-surface-variant">Phase</div>
                    <div className="mt-1 font-black text-on-surface">{site.currentPhase ?? 'Unassigned'}</div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-on-surface-variant">
                    Phase {site.currentPhase ?? 'Unassigned'}
                  </p>
                  <Link
                    href={buildFormsSelectionHref('category', { siteId: site.siteId })}
                    className="rounded-xl border border-outline-variant bg-surface px-4 py-2 text-sm font-black text-on-surface active-press"
                  >
                    →
                  </Link>
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-3xl border border-outline-variant bg-surface px-4 py-6 text-sm font-medium text-on-surface-variant">
              No live sites found.
            </div>
          )
        ) : (
          <div className="rounded-3xl border border-outline-variant bg-surface px-4 py-6 text-sm font-medium text-on-surface-variant">
            Loading live sites...
          </div>
        )}
      </section>
    </div>
  );
}
