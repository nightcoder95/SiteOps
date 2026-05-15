'use client';

import Link from 'next/link';

import type { DashboardData } from '@/lib/services/dashboard';

function progressColor(progress: number | null) {
  if (progress === null) return { bar: 'bg-outline', text: 'text-on-surface-variant' };
  if (progress >= 60) return { bar: 'bg-primary', text: 'text-primary' };
  if (progress >= 30) return { bar: 'bg-tertiary', text: 'text-tertiary' };
  return { bar: 'bg-error', text: 'text-error' };
}

export function DashboardPageClient({ data }: { data: DashboardData }) {
  const role = data.user.role;
  const unread = data.notifications.total;
  const sites = data.sites;
  const pendingCount = data.notifications.items.length;

  return (
    <div className="flex flex-col gap-density-medium">
      <header>
        <h2 className="font-headline-sm text-headline-sm text-on-background">Dashboard Overview</h2>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Real-time metrics for active projects.
        </p>
      </header>

      <Link
        href="/app/logs/new"
        className="flex h-11 w-full items-center justify-center gap-2 rounded bg-primary font-label-md text-label-md uppercase text-on-primary shadow-sm active-press"
      >
        <span className="material-symbols-outlined">edit_note</span>
        Log Daily Entry
      </Link>

      <section className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-label-md text-label-md uppercase text-on-background">Active Sites Progress</h3>
          <span className="material-symbols-outlined text-outline">business</span>
        </div>

        <div className="flex flex-col gap-3">
          {sites.length === 0 ? (
            <p className="font-body-md text-body-md text-on-surface-variant">No managed sites found.</p>
          ) : (
            sites.slice(0, 5).map((site) => {
              const pct = site.currentProgress ?? 0;
              const c = progressColor(site.currentProgress);
              return (
                <Link
                  key={site.siteId}
                  href={`/app/sites/${site.siteId}`}
                  className="flex flex-col gap-1 active-press"
                >
                  <div className="flex justify-between font-label-sm text-label-sm">
                    <span className="font-semibold text-on-background">{site.name}</span>
                    <span className={`font-bold ${c.text}`}>{pct}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-variant">
                    <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${pct}%` }} />
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-density-medium">
        <Link
          href="/app/admin/expenses"
          className="flex flex-col justify-between rounded-xl border border-outline-variant bg-surface-container-lowest p-4 active-press"
        >
          <div>
            <div className="mb-2 flex items-center gap-1">
              <span className="material-symbols-outlined text-outline" style={{ fontSize: '18px' }}>
                account_balance_wallet
              </span>
              <h3 className="font-label-md text-label-md uppercase text-on-surface-variant">Budget</h3>
            </div>
            <div className="font-headline-sm text-headline-sm text-on-background">{sites.length}</div>
            <div className="font-label-sm text-label-sm mt-1 text-on-surface-variant">Active sites</div>
          </div>
          <div className="mt-4 flex h-12 items-end gap-1">
            <div className="w-full rounded-t-sm bg-primary" style={{ height: '40%' }} />
            <div className="w-full rounded-t-sm bg-primary" style={{ height: '60%' }} />
            <div className="w-full rounded-t-sm bg-primary" style={{ height: '85%' }} />
            <div className="w-full rounded-t-sm bg-surface-variant" style={{ height: '100%' }} />
          </div>
        </Link>

        <Link
          href="/app/notifications"
          className="relative flex flex-col justify-between overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-4 active-press"
        >
          <div className="absolute -right-4 -top-4 text-error-container opacity-20">
            <span className="material-symbols-outlined" style={{ fontSize: '100px', fontVariationSettings: "'FILL' 1" }}>
              warning
            </span>
          </div>
          <div className="relative z-10">
            <div className="mb-2 flex items-center gap-1">
              <span className="material-symbols-outlined text-error" style={{ fontSize: '18px' }}>
                assignment_late
              </span>
              <h3 className="font-label-md text-label-md uppercase text-on-surface-variant">Pending</h3>
            </div>
            <div className="font-display-lg text-display-lg text-error">{unread}</div>
            <div className="font-label-sm text-label-sm mt-1 text-on-surface-variant">
              {pendingCount > 0 ? 'Requires attention' : 'All clear'}
            </div>
          </div>
        </Link>
      </div>

      {role === 'Admin' ? (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-headline-sm text-headline-sm text-on-background">Admin</h3>
          </div>
          <div className="grid grid-cols-2 gap-density-medium">
            {[
              { href: '/app/admin/live-feed', label: 'Pulse', icon: 'pulse_alert' },
              { href: '/app/admin/analytics', label: 'Analytics', icon: 'analytics' },
              { href: '/app/admin/approvals', label: 'Approvals', icon: 'fact_check' },
              { href: '/app/admin/expenses', label: 'Expenses', icon: 'account_balance_wallet' },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 active-press"
              >
                <span className="material-symbols-outlined text-primary">{item.icon}</span>
                <span className="font-label-md text-label-md uppercase text-on-surface">{item.label}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-2">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-headline-sm text-headline-sm text-on-background">Recent Activity</h3>
          <Link href="/app/admin/live-feed" className="font-label-md text-label-md uppercase text-primary">
            View All
          </Link>
        </div>
        <div className="divide-y divide-outline-variant rounded-xl border border-outline-variant bg-surface-container-lowest">
          {data.notifications.items.length === 0 ? (
            <div className="p-3 font-body-md text-body-md text-on-surface-variant">No recent activity.</div>
          ) : (
            data.notifications.items.map((item) => (
              <div key={item.id} className="flex items-start gap-3 p-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                    notifications
                  </span>
                </div>
                <div>
                  <p className="font-body-md text-body-md text-on-background">
                    <span className="font-semibold">{item.title}</span>
                    {item.message ? ` — ${item.message}` : ''}
                  </p>
                  <p className="font-label-sm text-label-sm mt-0.5 text-on-surface-variant">{item.type}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
