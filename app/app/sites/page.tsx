import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { safeGetSessionFromHeaders } from '@/lib/auth/session';
import { getAllSites, getSitesBySupervisor } from '@/lib/db/queries/sites';

type Site = {
  id: number;
  siteId: string;
  name: string;
  location: string;
  status: 'In Progress' | 'Blocked' | 'Completed';
  budget: string | null;
  currentProgress: number | null;
  currentPhase: string | null;
  supervisorId: string;
  createdAt: Date;
};

function formatBudget(value: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(number);
}

function statusStyle(status: Site['status']) {
  switch (status) {
    case 'Blocked':
      return {
        chip: 'bg-error-container text-on-error-container border-error/20',
        icon: 'warning',
        bar: 'bg-error',
        text: 'text-error',
      };
    case 'Completed':
      return {
        chip: 'bg-tertiary-container text-on-tertiary-container border-tertiary/20',
        icon: 'check_circle',
        bar: 'bg-tertiary',
        text: 'text-tertiary',
      };
    default:
      return {
        chip: 'bg-primary-container text-on-primary-container border-primary/20',
        icon: 'sync',
        bar: 'bg-primary',
        text: 'text-primary',
      };
  }
}

export default async function SitesPage() {
  const session = await safeGetSessionFromHeaders(await headers());
  if (!session) {
    redirect('/auth/sign-in');
  }

  const sites: Site[] =
    session.user.role === 'Admin'
      ? await getAllSites()
      : await getSitesBySupervisor(session.user.id);

  return (
    <div className="flex flex-col gap-density-medium">
      <div className="flex items-center justify-between">
        <h1 className="font-display-lg text-display-lg text-on-background">Active Sites</h1>
        <Link
          href="/app/sites/new"
          className="hidden md:flex items-center gap-2 rounded-full bg-primary px-4 py-2 font-label-md text-label-md uppercase text-on-primary hover:bg-surface-tint"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
          New Site
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-gutter md:grid-cols-2 lg:grid-cols-3">
        {sites.length === 0 ? (
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 font-body-md text-body-md text-on-surface-variant">
            No live sites available.
          </div>
        ) : (
          sites.map((site) => {
            const pct = site.currentProgress ?? 0;
            const s = statusStyle(site.status);
            return (
              <Link
                key={site.siteId}
                href={`/app/sites/${site.siteId}`}
                className="group flex flex-col gap-density-medium rounded-xl border border-outline-variant bg-surface-container-lowest p-density-medium transition-colors hover:border-primary"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="font-label-sm text-label-sm mb-1 text-on-surface-variant">ID: {site.siteId}</div>
                    <h2 className="font-headline-sm text-headline-sm truncate text-on-surface group-hover:text-primary">
                      {site.name}
                    </h2>
                    <div className="font-body-md text-body-md mt-1 flex items-center gap-1 text-on-surface-variant">
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>location_on</span>
                      {site.location}
                    </div>
                  </div>
                  <span className={`flex items-center gap-1 rounded-full border px-2 py-1 font-label-md text-label-md uppercase ${s.chip}`}>
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{s.icon}</span>
                    {site.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 rounded-lg bg-surface-container-low p-3">
                  <div>
                    <div className="font-label-sm text-label-sm mb-1 text-on-surface-variant">Current Phase</div>
                    <div className="font-body-md text-body-md font-medium text-on-surface">{site.currentPhase ?? '—'}</div>
                  </div>
                  <div>
                    <div className="font-label-sm text-label-sm mb-1 text-on-surface-variant">Budget</div>
                    <div className="font-body-md text-body-md font-medium text-on-surface">
                      {site.budget ? `₹${formatBudget(site.budget)}` : '—'}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex justify-between font-label-sm text-label-sm">
                    <span className="text-on-surface-variant">Overall Progress</span>
                    <span className={`font-bold ${s.text}`}>{pct}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-variant">
                    <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>

      <Link
        href="/app/sites/new"
        aria-label="Add new site"
        className="md:hidden fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-on-primary shadow-lg active:scale-95"
      >
        <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>add</span>
      </Link>
    </div>
  );
}
