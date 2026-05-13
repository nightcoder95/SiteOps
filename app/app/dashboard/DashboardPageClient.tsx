'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, FileEdit, TrendingUp } from 'lucide-react';

import { ApiUnavailableBanner } from '@/components/ui/ApiUnavailableBanner';
import { CountPill, PageStack } from '@/components/ui/page-primitives';
import { requestJson, type ClientResult } from '@/lib/http/client';

type SessionUser = {
  id: string;
  name: string | null;
  email: string;
  role: 'Admin' | 'Supervisor';
};

type Site = {
  id: number;
  siteId: string;
  name: string;
  location: string;
  status: 'In Progress' | 'Blocked' | 'Completed';
  budget: string;
  currentProgress: number | null;
  currentPhase: string | null;
  supervisorId: string;
};

type NotificationSummary = {
  items: Array<{
    id: string;
    title: string;
    message: string;
    type: string;
    readAt: string | null;
  }>;
  total: number;
};

export function DashboardPageClient() {
  const [userResult, setUserResult] = useState<ClientResult<{ user: SessionUser; profile: unknown }> | null>(null);
  const [sitesResult, setSitesResult] = useState<ClientResult<Site[]> | null>(null);
  const [notificationsResult, setNotificationsResult] = useState<ClientResult<NotificationSummary> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [user, sites, notifications] = await Promise.all([
        requestJson<{ user: SessionUser; profile: unknown }>('/api/users/me'),
        requestJson<Site[]>('/api/sites'),
        requestJson<NotificationSummary>('/api/notifications?unreadOnly=true&limit=4'),
      ]);

      if (cancelled) return;
      setUserResult(user);
      setSitesResult(sites);
      setNotificationsResult(notifications);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const role = userResult?.ok ? userResult.data.user.role : 'Supervisor';
  const sites = sitesResult?.ok ? sitesResult.data : [];
  const unread = notificationsResult?.ok ? notificationsResult.data.items.filter((item) => !item.readAt).length : 0;

  const sitesSummary = useMemo(
    () =>
      sites.map((site) => ({
        id: site.siteId,
        name: site.name,
        subtitle: `${site.location} / ${site.currentPhase ?? site.status}`.toUpperCase(),
      })),
    [sites],
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
              {sitesResult?.ok ? 'No managed sites found.' : 'Loading managed sites...'}
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

      {userResult && !userResult.ok && userResult.kind === 'endpoint_unavailable' ? (
        <ApiUnavailableBanner endpoint={userResult.endpoint} method={userResult.method} />
      ) : null}
      {sitesResult && !sitesResult.ok && sitesResult.kind === 'endpoint_unavailable' ? (
        <ApiUnavailableBanner endpoint={sitesResult.endpoint} method={sitesResult.method} />
      ) : null}
      {notificationsResult && !notificationsResult.ok && notificationsResult.kind === 'endpoint_unavailable' ? (
        <ApiUnavailableBanner endpoint={notificationsResult.endpoint} method={notificationsResult.method} />
      ) : null}

      {sitesResult && !sitesResult.ok && sitesResult.kind !== 'endpoint_unavailable' ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          {sitesResult.message}
        </div>
      ) : null}
      {sitesResult?.ok ? (
        <div className="flex items-center justify-end">
          <CountPill>{sitesResult.data.length} Sites</CountPill>
        </div>
      ) : null}
    </PageStack>
  );
}
