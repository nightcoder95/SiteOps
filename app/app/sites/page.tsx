import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { PageHero, PageStack } from '@/components/ui/page-primitives';
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
    <PageStack>
      <PageHero
        eyebrow="Supervisor Route"
        title="Active sites"
        description="Select a site or create a new one to start logging labour, materials, machinery, and expenses."
      />
      <div className="flex justify-end">
        <Link
          href="/app/forms/site"
          className="rounded-full bg-machined-gradient px-4 py-2 text-sm font-black text-white shadow-lg shadow-primary/20 active-press"
        >
          + Add Site
        </Link>
      </div>

      <section className="grid gap-3">
        {sites.length > 0 ? (
          sites.map((site) => (
            <Link
              key={site.siteId}
              href={`/app/sites/${site.siteId}`}
              className="rounded-[1.75rem] border border-outline-variant bg-surface p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)] active-press"
            >
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
                  <div className="mt-1 font-black text-on-surface">{site.budget ? `₹${formatBudget(site.budget)}` : '—'}</div>
                </div>
                <div className="rounded-2xl bg-surface-container-low px-3 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.24em] text-on-surface-variant">Phase</div>
                  <div className="mt-1 font-black text-on-surface">{site.currentPhase ?? 'Unassigned'}</div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-on-surface-variant">Progress {site.currentProgress ?? 0}%</p>
                <span className="text-sm font-black text-primary">Open detail</span>
              </div>
            </Link>
          ))
        ) : (
          <div className="rounded-3xl border border-outline-variant bg-surface px-4 py-6 text-sm font-medium text-on-surface-variant">
            No live sites available.
          </div>
        )}
      </section>
    </PageStack>
  );
}
