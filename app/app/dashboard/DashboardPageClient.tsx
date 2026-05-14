'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { ChevronRight, FileEdit, TrendingUp } from 'lucide-react';

import { CountPill, PageStack } from '@/components/ui/page-primitives';
import type { DashboardData } from '@/lib/services/dashboard';

export function DashboardPageClient({ data }: { data: DashboardData }) {
  const role = data.user.role;
  const unread = data.notifications.total;

  const sitesSummary = useMemo(
    () =>
      data.sites.map((site) => ({
        id: site.siteId,
        name: site.name,
        subtitle: `${site.location} / ${site.currentPhase ?? site.status}`.toUpperCase(),
      })),
    [data.sites],
  );

  return (
    <PageStack>
      <section className="relative overflow-hidden rounded-3xl border border-outline-variant/10 bg-white p-6 shadow-sm">
        <div className="relative z-10">
          <span className="mb-1 block font-headline text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
            Operational update
          </span>
          <h2 className="font-headline text-4xl font-black uppercase leading-none tracking-tighter text-on-surface">
            Home Base: PHASE 2A
          </h2>
          <Link
            href="/app/forms/site"
            className="machined-gradient mt-8 flex w-full items-center justify-center gap-3 rounded-xl px-6 py-3 font-headline text-sm font-bold uppercase tracking-widest text-on-primary shadow-lg shadow-primary/20 active-press"
          >
            <FileEdit className="h-5 w-5" />
            Log Daily Entry
          </Link>
        </div>
        <div className="absolute right-4 top-4 text-on-surface-variant/5">
          <TrendingUp size={64} />
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="font-headline text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant">
          Managed Sites
        </h3>

        <div className="space-y-3">
          {sitesSummary.length > 0 ? sitesSummary.map((site) => (
            <Link
              key={site.id}
              href={`/app/sites/${site.id}`}
              className="group flex w-full items-center justify-between rounded-2xl border border-outline-variant/10 bg-white p-5 text-left shadow-sm active-press"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface">
                  <TrendingUp className="h-6 w-6 shrink-0 text-primary opacity-60" />
                </div>
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-tight text-on-surface">{site.name}</h4>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/60">{site.subtitle}</p>
                </div>
              </div>
              <div className="rounded-lg border border-outline-variant/30 p-2 transition-colors group-hover:bg-primary/5">
                <ChevronRight className="h-4 w-4 text-primary" />
              </div>
            </Link>
          )) : (
            <div className="rounded-2xl border border-outline-variant bg-surface px-4 py-4 text-sm font-medium text-on-surface-variant">
              No managed sites found.
            </div>
          )}
        </div>
      </section>

      {role === 'Admin' ? (
        <section className="grid grid-cols-2 gap-3">
          <Link href="/app/admin/live-feed" className="rounded-2xl border border-outline-variant/10 bg-white p-4 text-sm font-bold uppercase tracking-wide text-on-surface shadow-sm active-press">
            Pulse
          </Link>
          <Link href="/app/admin/analytics" className="rounded-2xl border border-outline-variant/10 bg-white p-4 text-sm font-bold uppercase tracking-wide text-on-surface shadow-sm active-press">
            Analytics
          </Link>
          <Link href="/app/admin/approvals" className="rounded-2xl border border-outline-variant/10 bg-white p-4 text-sm font-bold uppercase tracking-wide text-on-surface shadow-sm active-press">
            Approvals
          </Link>
          <Link href="/app/admin/expenses" className="rounded-2xl border border-outline-variant/10 bg-white p-4 text-sm font-bold uppercase tracking-wide text-on-surface shadow-sm active-press">
            Expenses
          </Link>
        </section>
      ) : null}

      {unread > 0 ? (
        <Link href="/app/notifications" className="block rounded-xl border border-outline-variant/20 bg-white px-4 py-3 text-xs font-bold uppercase tracking-widest text-on-surface-variant active-press">
          {unread} unread alerts
        </Link>
      ) : null}

      <div className="flex items-center justify-end">
        <CountPill>{data.sites.length} Sites</CountPill>
      </div>
    </PageStack>
  );
}
