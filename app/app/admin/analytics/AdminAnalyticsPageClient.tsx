'use client';

import { useState } from 'react';

import { ApiUnavailableBanner } from '@/components/ui/ApiUnavailableBanner';
import type { ClientResult } from '@/lib/http/client';
import { useApiResult } from '@/lib/http/useApiQuery';

type AnalyticsResponse = {
  period: '7d' | '30d' | '90d';
  sites: number;
  entries: {
    labour: number;
    material: number;
    machinery: number;
    expense: number;
    incident: number;
  };
  resourceRequests: number;
};

export function AdminAnalyticsPageClient({
  initialPeriod,
  initialAnalytics,
}: {
  initialPeriod: '7d' | '30d' | '90d';
  initialAnalytics: AnalyticsResponse;
}) {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>(initialPeriod);
  // Keyed by period: each window is cached and revalidated independently, and
  // switching periods renders the last-seen value instantly then refreshes.
  // The server render already fetched the initial period; seed that key so the
  // first paint shows numbers, not a loading state (audit F16). Other periods
  // fetch on demand exactly as before.
  const { data: result } = useApiResult<AnalyticsResponse>(`/api/admin/analytics?period=${period}`, {
    fallbackData: period === initialPeriod
      ? ({ ok: true, data: initialAnalytics, status: 200 } as ClientResult<AnalyticsResponse>)
      : undefined,
  });

  return (
    <div className="space-y-4">
      <section className="card-standard p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-on-surface-variant">Pulse</p>
        <h2 className="mt-2 text-2xl font-black text-on-surface">Admin analytics</h2>
        <p className="mt-2 max-w-2xl text-sm font-medium text-on-surface-variant">
          Periodic stats now come from the live admin analytics API and stay route-driven.
        </p>
      </section>

      {result && !result.ok && result.kind === 'endpoint_unavailable' ? (
        <ApiUnavailableBanner endpoint={result.endpoint} method={result.method} />
      ) : null}
      {result && !result.ok && result.kind !== 'endpoint_unavailable' ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300">
          {result.message}
        </div>
      ) : null}

      <label className="grid gap-2 rounded-[1.75rem] border border-outline-variant bg-surface p-4 text-sm font-semibold text-on-surface shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
        Period
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as typeof period)}
          className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface"
        >
          <option value="7d">7d</option>
          <option value="30d">30d</option>
          <option value="90d">90d</option>
        </select>
      </label>

      {result?.ok ? (
        <section className="grid gap-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-[1.5rem] border border-outline-variant bg-surface p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
              <div className="text-[10px] font-black uppercase tracking-[0.28em] text-on-surface-variant">Sites</div>
              <div className="mt-2 text-2xl font-black text-on-surface">{result.data.sites}</div>
            </div>
            <div className="rounded-[1.5rem] border border-outline-variant bg-surface p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
              <div className="text-[10px] font-black uppercase tracking-[0.28em] text-on-surface-variant">Labour</div>
              <div className="mt-2 text-2xl font-black text-on-surface">{result.data.entries.labour}</div>
            </div>
            <div className="rounded-[1.5rem] border border-outline-variant bg-surface p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
              <div className="text-[10px] font-black uppercase tracking-[0.28em] text-on-surface-variant">Expense</div>
              <div className="mt-2 text-2xl font-black text-on-surface">{result.data.entries.expense}</div>
            </div>
            <div className="rounded-[1.5rem] border border-outline-variant bg-surface p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
              <div className="text-[10px] font-black uppercase tracking-[0.28em] text-on-surface-variant">Requests</div>
              <div className="mt-2 text-2xl font-black text-on-surface">{result.data.resourceRequests}</div>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-outline-variant bg-surface p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
            <h3 className="text-lg font-black text-on-surface">Breakdown</h3>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
              <div className="rounded-2xl bg-surface-container-low px-3 py-3">Material: <span className="font-black">{result.data.entries.material}</span></div>
              <div className="rounded-2xl bg-surface-container-low px-3 py-3">Machinery: <span className="font-black">{result.data.entries.machinery}</span></div>
              <div className="rounded-2xl bg-surface-container-low px-3 py-3">Incident: <span className="font-black">{result.data.entries.incident}</span></div>
            </div>
          </div>
        </section>
      ) : (
        <div className="rounded-3xl border border-outline-variant bg-surface px-4 py-6 text-sm font-medium text-on-surface-variant">
          Loading analytics...
        </div>
      )}
    </div>
  );
}
