'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { ApiUnavailableBanner } from '@/components/ui/ApiUnavailableBanner';
import { requestJson, type ClientResult } from '@/lib/http/client';

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
};

type EntryType = 'labour' | 'material' | 'machinery' | 'expense' | 'incident' | 'all';
type EditableEntryType = Exclude<EntryType, 'all'>;
type Entry = Record<string, any> & { id: string };
type SiteEntriesResponse =
  | Entry[]
  | {
      labour: Entry[];
      material: Entry[];
      machinery: Entry[];
      expense: Entry[];
      incident: Entry[];
    };

type SiteDetailPageClientProps = {
  siteId: string;
  initialSite: Site;
  initialEntries: SiteEntriesResponse;
  role: 'Admin' | 'Supervisor';
};

const TYPE_ICONS: Record<EditableEntryType, string> = {
  labour: 'engineering',
  material: 'inventory_2',
  machinery: 'precision_manufacturing',
  expense: 'account_balance_wallet',
  incident: 'report',
};

function formatDate(value?: string) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function summarizeEntry(entry: Entry, type: EditableEntryType) {
  if (type === 'labour') return `${entry.workType ?? 'Labour'} • ${entry.peopleCount ?? 0} people`;
  if (type === 'material') return `${entry.materialType ?? 'Material'} • ${entry.quantity ?? 0} ${entry.unit ?? ''}`.trim();
  if (type === 'machinery') return `${entry.equipmentType ?? 'Machinery'} • ${entry.count ?? 0} units`;
  if (type === 'expense') return `${entry.description ?? 'Expense'} • ₹${entry.amount ?? 0}`;
  if (type === 'incident') return `${entry.incidentType ?? 'Incident'} • ${entry.severity ?? 'Low'}`;
  return entry.id;
}

function entryRowId(entry: Entry, type: EditableEntryType): string {
  switch (type) {
    case 'labour':
      return entry.labourEntryId ?? entry.id;
    case 'material':
      return entry.materialEntryId ?? entry.id;
    case 'machinery':
      return entry.machineryEntryId ?? entry.id;
    case 'expense':
      return entry.expenseEntryId ?? entry.id;
    case 'incident':
      return entry.incidentReportId ?? entry.id;
  }
}

function statusChip(status: Site['status']) {
  switch (status) {
    case 'Blocked':
      return 'bg-error-container text-on-error-container border-error/20';
    case 'Completed':
      return 'bg-tertiary-container text-on-tertiary-container border-tertiary/20';
    default:
      return 'bg-primary-container text-on-primary-container border-primary/20';
  }
}

export default function SiteDetailPageClient({
  siteId,
  initialSite,
  initialEntries,
  role,
}: SiteDetailPageClientProps) {
  const router = useRouter();
  const [siteResult] = useState<ClientResult<Site> | null>({ ok: true, data: initialSite });
  const [entriesResult, setEntriesResult] = useState<ClientResult<SiteEntriesResponse> | null>({
    ok: true,
    data: initialEntries,
  });
  const [type, setType] = useState<EntryType>('all');
  const [loading, setLoading] = useState(false);
  const [deletingSite, setDeletingSite] = useState(false);

  async function onChangeType(next: EntryType) {
    setType(next);
    setEntriesResult(null);
    setLoading(true);
    const res = await requestJson<SiteEntriesResponse>(
      `/api/sites/${siteId}/entries?type=${encodeURIComponent(next)}`,
    );
    setEntriesResult(res);
    setLoading(false);
  }

  const site = siteResult?.ok ? siteResult.data : initialSite;
  const progress = site.currentProgress ?? 0;

  async function handleDeleteSite() {
    if (role !== 'Admin') return;
    const confirmed = window.confirm(`Archive site "${site.name}"?`);
    if (!confirmed) return;
    setDeletingSite(true);
    const res = await requestJson<null>(`/api/sites/${siteId}`, { method: 'DELETE' });
    setDeletingSite(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success('Site archived');
    router.push('/app/sites');
  }

  return (
    <div className="flex flex-col gap-density-medium">
      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="font-label-sm text-label-sm text-on-surface-variant">ID: {site.siteId}</div>
            <h2 className="font-headline-md text-headline-md mt-1 text-on-surface">{site.name}</h2>
            <div className="font-body-md text-body-md mt-1 flex items-center gap-1 text-on-surface-variant">
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>location_on</span>
              {site.location}
            </div>
          </div>
          <span
            className={`flex items-center gap-1 rounded-full border px-2 py-1 font-label-md text-label-md uppercase ${statusChip(site.status)}`}
          >
            {site.status}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 rounded-lg bg-surface-container-low p-3 md:grid-cols-4">
          <div>
            <div className="font-label-sm text-label-sm text-on-surface-variant">Phase</div>
            <div className="font-body-md text-body-md font-medium text-on-surface">{site.currentPhase ?? '—'}</div>
          </div>
          <div>
            <div className="font-label-sm text-label-sm text-on-surface-variant">Budget</div>
            <div className="font-body-md text-body-md font-medium text-on-surface">
              {site.budget ? `₹${Number(site.budget).toLocaleString('en-IN')}` : '—'}
            </div>
          </div>
          <div>
            <div className="font-label-sm text-label-sm text-on-surface-variant">Progress</div>
            <div className="font-body-md text-body-md font-medium text-primary">{progress}%</div>
          </div>
          <div>
            <div className="font-label-sm text-label-sm text-on-surface-variant">Status</div>
            <div className="font-body-md text-body-md font-medium text-on-surface">{site.status}</div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-variant">
            <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/app/logs/new?siteId=${encodeURIComponent(siteId)}`}
            className="flex h-10 items-center gap-2 rounded bg-primary px-4 font-label-md text-label-md uppercase text-on-primary active-press"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>edit_note</span>
            Add Log Entry
          </Link>
          <Link
            href={`/app/transfers/new?fromSite=${encodeURIComponent(siteId)}`}
            className="flex h-10 items-center gap-2 rounded border border-outline px-4 font-label-md text-label-md uppercase text-on-surface-variant active-press"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>swap_horiz</span>
            Transfer
          </Link>
          <button
            type="button"
            onClick={() => void handleDeleteSite()}
            disabled={role !== 'Admin' || deletingSite}
            title={role === 'Admin' ? 'Archive site' : 'Only admins can delete sites'}
            className="flex h-10 items-center gap-2 rounded border border-error/35 px-4 font-label-md text-label-md uppercase text-error disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
            {deletingSite ? 'Deleting…' : 'Delete Site'}
          </button>
        </div>
      </section>

      {entriesResult && !entriesResult.ok && entriesResult.kind === 'endpoint_unavailable' ? (
        <ApiUnavailableBanner endpoint={entriesResult.endpoint} method={entriesResult.method} />
      ) : null}

      {entriesResult && !entriesResult.ok && entriesResult.kind !== 'endpoint_unavailable' ? (
        <div className="rounded-xl border border-error-container bg-error-container/30 px-4 py-3 font-body-md text-body-md text-on-error-container">
          {entriesResult.message}
        </div>
      ) : null}

      <div className="no-scrollbar -mx-margin-mobile flex gap-2 overflow-x-auto px-margin-mobile">
        {(['all', 'labour', 'material', 'machinery', 'expense', 'incident'] as EntryType[]).map((next) => (
          <button
            key={next}
            type="button"
            onClick={() => onChangeType(next)}
            className={[
              'flex h-9 shrink-0 items-center rounded-full border px-4 font-label-md text-label-md uppercase transition-colors',
              type === next
                ? 'border-primary bg-primary text-on-primary'
                : 'border-outline-variant bg-surface-container-lowest text-on-surface-variant',
            ].join(' ')}
          >
            {next}
          </button>
        ))}
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-headline-sm text-headline-sm text-on-background">
            {type === 'all' ? 'All entries' : `${type} entries`}
          </h3>
          <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">
            {loading ? 'Loading…' : 'Live'}
          </span>
        </div>

        {entriesResult?.ok ? (
          type === 'all' ? (
            <div className="grid gap-density-medium md:grid-cols-2">
              {(['labour', 'material', 'machinery', 'expense', 'incident'] as EditableEntryType[]).map((group) => {
                const list = (entriesResult.data as Record<string, Entry[]>)[group] ?? [];
                return (
                  <div key={group} className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary" style={{ fontSize: '20px' }}>
                          {TYPE_ICONS[group]}
                        </span>
                        <span className="font-label-md text-label-md uppercase text-on-surface-variant">{group}</span>
                      </div>
                      <span className="rounded-full bg-surface-container-low px-2 py-0.5 font-label-sm text-label-sm text-on-surface-variant">
                        {list.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {list.length === 0 ? (
                        <p className="font-body-md text-body-md text-on-surface-variant">No entries.</p>
                      ) : (
                        list.slice(0, 3).map((entry) => {
                          const id = entryRowId(entry, group);
                          return (
                            <Link
                              key={id}
                              href={`/app/logs/${id}?type=${group}`}
                              className="block rounded-lg bg-surface-container-low px-3 py-2 active-press"
                            >
                              <div className="font-body-md text-body-md font-medium text-on-surface">
                                {summarizeEntry(entry, group)}
                              </div>
                              <div className="font-label-sm text-label-sm mt-0.5 text-on-surface-variant">
                                {formatDate(entry.date ?? entry.createdAt ?? entry.timestamp)}
                              </div>
                            </Link>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid gap-density-medium">
              {Array.isArray(entriesResult.data) && entriesResult.data.length > 0 ? (
                (entriesResult.data as Entry[]).map((entry) => {
                  const editableType = type as EditableEntryType;
                  const id = entryRowId(entry, editableType);
                  return (
                    <Link
                      key={id}
                      href={`/app/logs/${id}?type=${editableType}`}
                      className="flex items-start gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 active-press"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
                        <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                          {TYPE_ICONS[editableType]}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-body-md text-body-md font-semibold text-on-surface">
                          {summarizeEntry(entry, editableType)}
                        </div>
                        <div className="font-label-sm text-label-sm mt-0.5 text-on-surface-variant">
                          {formatDate(entry.date ?? entry.createdAt ?? entry.timestamp)}
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '20px' }}>
                        chevron_right
                      </span>
                    </Link>
                  );
                })
              ) : (
                <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 font-body-md text-body-md text-on-surface-variant">
                  No entries found for this type.
                </div>
              )}
            </div>
          )
        ) : (
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 font-body-md text-body-md text-on-surface-variant">
            Loading entries…
          </div>
        )}
      </section>
    </div>
  );
}
