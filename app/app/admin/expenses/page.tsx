'use client';

import { useEffect, useState } from 'react';

import { ApiUnavailableBanner } from '@/components/ui/ApiUnavailableBanner';
import { useApiResult } from '@/lib/http/useApiQuery';

type Site = {
  id: string;
  name: string;
  location: string;
  status: string;
  budget: string;
};

type ExpenseEntry = {
  id: string;
  date: string;
  description: string;
  amount: string;
  category: string;
  createdAt: string;
};

export default function AdminExpensesPage() {
  const [siteId, setSiteId] = useState<string>('');
  const { data: sitesResult } = useApiResult<Site[]>('/api/sites');
  // Conditional key: expenses don't fetch until a site is selected (null key
  // = SWR skip). Each site's expenses are cached independently.
  const { data: expensesResult } = useApiResult<ExpenseEntry[]>(
    siteId ? `/api/sites/${siteId}/entries?type=expense` : null,
  );

  // Default to the first site once the list arrives.
  useEffect(() => {
    if (!siteId && sitesResult?.ok && sitesResult.data[0]?.id) {
      setSiteId(sitesResult.data[0].id);
    }
  }, [siteId, sitesResult]);

  const sites = sitesResult?.ok ? sitesResult.data : [];
  const expenses = expensesResult?.ok ? expensesResult.data : [];
  const total = expenses.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  return (
    <div className="space-y-4">
      <section className="card-standard p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-on-surface-variant">Expenses</p>
        <h2 className="mt-2 text-2xl font-black text-on-surface">Site spend browser</h2>
        <p className="mt-2 max-w-2xl text-sm font-medium text-on-surface-variant">
          This route is wired to the live sites list and the per-site expense entry API.
        </p>
      </section>

      {sitesResult && !sitesResult.ok && sitesResult.kind === 'endpoint_unavailable' ? (
        <ApiUnavailableBanner endpoint={sitesResult.endpoint} method={sitesResult.method} />
      ) : null}
      {expensesResult && !expensesResult.ok && expensesResult.kind === 'endpoint_unavailable' ? (
        <ApiUnavailableBanner endpoint={expensesResult.endpoint} method={expensesResult.method} />
      ) : null}

      <label className="grid gap-2 rounded-[1.75rem] border border-outline-variant bg-surface p-4 text-sm font-semibold text-on-surface shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
        Site
        <select
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface"
        >
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </select>
      </label>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-[1.5rem] border border-outline-variant bg-surface p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
          <div className="text-[10px] font-black uppercase tracking-[0.28em] text-on-surface-variant">Expenses</div>
          <div className="mt-2 text-2xl font-black text-on-surface">{expenses.length}</div>
        </div>
        <div className="rounded-[1.5rem] border border-outline-variant bg-surface p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
          <div className="text-[10px] font-black uppercase tracking-[0.28em] text-on-surface-variant">Total</div>
          <div className="mt-2 text-2xl font-black text-on-surface">₹{total.toLocaleString('en-IN')}</div>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-outline-variant bg-surface p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
        <h3 className="text-lg font-black text-on-surface">Expense entries</h3>
        <div className="mt-4 grid gap-3">
          {expensesResult?.ok ? (
            expenses.length > 0 ? (
              expenses.map((entry) => (
                <article key={entry.id} className="rounded-2xl bg-surface-container-low px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-black text-on-surface">{entry.description}</div>
                      <div className="text-sm text-on-surface-variant">{entry.date}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-black text-on-surface">₹{Number(entry.amount).toLocaleString('en-IN')}</div>
                      <div className="text-xs font-black uppercase tracking-[0.24em] text-on-surface-variant">{entry.category}</div>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-2xl border border-outline-variant bg-surface px-4 py-4 text-sm font-medium text-on-surface-variant">
                No expense entries found for this site.
              </div>
            )
          ) : (
            <div className="rounded-2xl border border-outline-variant bg-surface px-4 py-4 text-sm font-medium text-on-surface-variant">
              {siteId ? 'Loading expenses...' : 'Select a site to load expenses.'}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
