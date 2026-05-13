'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

import { ApiUnavailableBanner } from '@/components/ui/ApiUnavailableBanner';
import { requestJson, type ClientResult } from '@/lib/http/client';

// Route contract: /app/sites/[id] (Supervisor/Admin)

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

function toNumber(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatDate(value?: string) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function summarizeEntry(entry: Entry, type: EntryType) {
  if (type === 'labour') return `${entry.workType ?? 'Labour'} • ${entry.peopleCount ?? 0} people`;
  if (type === 'material') return `${entry.materialType ?? 'Material'} • ${entry.quantity ?? 0} ${entry.unit ?? ''}`.trim();
  if (type === 'machinery') return `${entry.equipmentType ?? 'Machinery'} • ${entry.count ?? 0} units`;
  if (type === 'expense') return `${entry.description ?? 'Expense'} • ₹${entry.amount ?? 0}`;
  if (type === 'incident') return `${entry.incidentType ?? 'Incident'} • ${entry.severity ?? 'Low'}`;
  return entry.id;
}

export default function SiteDetailPage() {
  const params = useParams<{ id: string }>();
  const siteId = params.id;

  const [siteResult, setSiteResult] = useState<ClientResult<Site> | null>(null);
  const [entriesResult, setEntriesResult] = useState<ClientResult<SiteEntriesResponse> | null>(null);
  const [type, setType] = useState<EntryType>('all');
  const [loading, setLoading] = useState(true);
  const [submitState, setSubmitState] = useState<ClientResult<unknown> | null>(null);
  const [sitesResult, setSitesResult] = useState<ClientResult<Site[]> | null>(null);
  const [transferState, setTransferState] = useState<ClientResult<unknown> | null>(null);

  const postUrl = useMemo(() => {
    if (type === 'labour') return '/api/entries/labour';
    if (type === 'material') return '/api/entries/materials';
    if (type === 'machinery') return '/api/entries/machinery';
    if (type === 'expense') return '/api/entries/expenses';
    if (type === 'incident') return '/api/entries/incidents';
    return null;
  }, [type]);

  async function loadSite() {
    const res = await requestJson<Site>(`/api/sites/${siteId}`);
    setSiteResult(res);
    return res;
  }

  async function loadEntries(nextType: EntryType) {
    const res = await requestJson<SiteEntriesResponse>(`/api/sites/${siteId}/entries?type=${encodeURIComponent(nextType)}`);
    setEntriesResult(res);
    return res;
  }

  async function loadSites() {
    const res = await requestJson<Site[]>('/api/sites');
    setSitesResult(res);
    return res;
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [site, entries, sites] = await Promise.all([loadSite(), loadEntries(type), loadSites()]);
      if (cancelled) return;
      setSiteResult(site);
      setEntriesResult(entries);
      setSitesResult(sites);
      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
    // siteId changes when route changes; type is intentionally excluded because the effect is for initial load only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  async function onChangeType(next: EntryType) {
    setType(next);
    setSubmitState(null);
    setEntriesResult(null);
    await loadEntries(next);
  }

  async function onSubmitEntry(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!postUrl) return;

    const fd = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = { siteId, date: String(fd.get('date') ?? '') };

    if (type === 'labour') {
      payload.workType = String(fd.get('workType') ?? '');
      payload.peopleCount = toNumber(fd.get('peopleCount'));
      payload.remarks = String(fd.get('remarks') ?? '');
    }

    if (type === 'material') {
      payload.materialType = String(fd.get('materialType') ?? '');
      payload.quantity = toNumber(fd.get('quantity'));
      payload.unit = String(fd.get('unit') ?? '');
      payload.remarks = String(fd.get('remarks') ?? '');
    }

    if (type === 'machinery') {
      payload.equipmentType = String(fd.get('equipmentType') ?? '');
      payload.count = toNumber(fd.get('count'));
      payload.hoursActive = toNumber(fd.get('hoursActive'));
      payload.remarks = String(fd.get('remarks') ?? '');
    }

    if (type === 'expense') {
      payload.description = String(fd.get('description') ?? '');
      payload.amount = toNumber(fd.get('amount'));
      payload.category = String(fd.get('category') ?? '');
    }

    if (type === 'incident') {
      payload.incidentType = String(fd.get('incidentType') ?? '');
      payload.severity = String(fd.get('severity') ?? '');
      payload.description = String(fd.get('description') ?? '');
      const durationEstimate = toNumber(fd.get('durationEstimate'));
      if (durationEstimate !== null) payload.durationEstimate = durationEstimate;
    }

    const res = await requestJson(postUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    setSubmitState(res);
    if (res.ok) {
      await loadEntries(type);
      e.currentTarget.reset();
    }
  }

  async function onSubmitTransfer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const resourceType = String(fd.get('resourceType') ?? '') as 'Labour' | 'Materials';
    const toSiteId = String(fd.get('toSiteId') ?? '');
    const quantity = Number(fd.get('quantity') ?? 0);
    const remarks = String(fd.get('remarks') ?? '').trim();
    const payload: Record<string, unknown> = {
      fromSiteId: siteId,
      toSiteId,
      resourceType,
      quantity,
      remarks: remarks || null,
    };

    if (resourceType === 'Labour') {
      payload.workTypeMode = 'default_enum';
      payload.workTypeEnum = String(fd.get('workTypeEnum') ?? '');
    } else {
      payload.materialTypeMode = 'default_enum';
      payload.materialTypeEnum = String(fd.get('materialTypeEnum') ?? '');
      payload.unitMode = 'custom';
      payload.unitCustomId = String(fd.get('unitCustomId') ?? '');
    }

    const res = await requestJson('/api/transfers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setTransferState(res);
    if (res.ok) e.currentTarget.reset();
  }

  const entryList = entriesResult?.ok && Array.isArray(entriesResult.data) ? entriesResult.data : [];

  return (
    <div className="space-y-4">
      <section className="rounded-[2rem] bg-[linear-gradient(135deg,#fff7ed_0%,#fff_55%,#e2e8f0_100%)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-on-surface-variant">Site detail</p>
        <h2 className="mt-2 text-2xl font-black text-on-surface">{siteResult?.ok ? siteResult.data.name : 'Loading site...'}</h2>
        <p className="mt-2 max-w-2xl text-sm font-medium text-on-surface-variant">
          Route-native detail, live entries, and live submission forms for the selected site.
        </p>
      </section>

      {siteResult && !siteResult.ok && siteResult.kind === 'endpoint_unavailable' ? (
        <ApiUnavailableBanner endpoint={siteResult.endpoint} method={siteResult.method} />
      ) : null}
      {entriesResult && !entriesResult.ok && entriesResult.kind === 'endpoint_unavailable' ? (
        <ApiUnavailableBanner endpoint={entriesResult.endpoint} method={entriesResult.method} />
      ) : null}

      {siteResult && !siteResult.ok && siteResult.kind !== 'endpoint_unavailable' ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          {siteResult.message}
        </div>
      ) : null}
      {entriesResult && !entriesResult.ok && entriesResult.kind !== 'endpoint_unavailable' ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          {entriesResult.message}
        </div>
      ) : null}
      {submitState && !submitState.ok ? (
        submitState.kind === 'endpoint_unavailable' ? (
          <ApiUnavailableBanner endpoint={submitState.endpoint} method={submitState.method} />
        ) : (
          <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
            {submitState.message}
          </div>
        )
      ) : null}

      <section className="grid gap-3 rounded-[1.75rem] border border-outline-variant bg-surface p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap gap-2">
          {(['all', 'labour', 'material', 'machinery', 'expense', 'incident'] as EntryType[]).map((next) => (
            <button
              key={next}
              type="button"
              onClick={() => onChangeType(next)}
              className={[
                'rounded-full px-4 py-2 text-sm font-black capitalize',
                type === next ? 'bg-machined-gradient text-white' : 'bg-surface-container-low text-on-surface-variant',
              ].join(' ')}
            >
              {next}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div className="rounded-2xl bg-surface-container-low px-3 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-on-surface-variant">Location</div>
            <div className="mt-1 font-black text-on-surface">{siteResult?.ok ? siteResult.data.location : '—'}</div>
          </div>
          <div className="rounded-2xl bg-surface-container-low px-3 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-on-surface-variant">Status</div>
            <div className="mt-1 font-black text-on-surface">{siteResult?.ok ? siteResult.data.status : '—'}</div>
          </div>
          <div className="rounded-2xl bg-surface-container-low px-3 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-on-surface-variant">Budget</div>
            <div className="mt-1 font-black text-on-surface">{siteResult?.ok && siteResult.data.budget ? `₹${Number(siteResult.data.budget).toLocaleString('en-IN')}` : '—'}</div>
          </div>
          <div className="rounded-2xl bg-surface-container-low px-3 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-on-surface-variant">Phase</div>
            <div className="mt-1 font-black text-on-surface">{siteResult?.ok ? siteResult.data.currentPhase ?? 'Unassigned' : '—'}</div>
          </div>
        </div>
      </section>

      {postUrl ? (
        <form onSubmit={onSubmitEntry} className="rounded-[1.75rem] border border-outline-variant bg-surface p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-black text-on-surface">New {type} entry</h3>
            <span className="rounded-full bg-primary-container px-3 py-1 text-[10px] font-black uppercase tracking-[0.28em] text-primary">
              Live API
            </span>
          </div>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-2 text-sm font-semibold text-on-surface">
              Date
              <input name="date" type="date" required className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface" />
            </label>

            {type === 'labour' ? (
              <>
                <label className="grid gap-2 text-sm font-semibold text-on-surface">
                  Work Type
                  <input name="workType" required className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface" />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-on-surface">
                  People Count
                  <input name="peopleCount" type="number" min={1} required className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface" />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-on-surface">
                  Remarks
                  <input name="remarks" className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface" />
                </label>
              </>
            ) : null}

            {type === 'material' ? (
              <>
                <label className="grid gap-2 text-sm font-semibold text-on-surface">
                  Material Type
                  <input name="materialType" required className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface" />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-on-surface">
                  Quantity
                  <input name="quantity" type="number" step="0.01" min={0} required className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface" />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-on-surface">
                  Unit
                  <input name="unit" required className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface" />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-on-surface">
                  Remarks
                  <input name="remarks" className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface" />
                </label>
              </>
            ) : null}

            {type === 'machinery' ? (
              <>
                <label className="grid gap-2 text-sm font-semibold text-on-surface">
                  Equipment Type
                  <input name="equipmentType" required className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface" />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-on-surface">
                  Count
                  <input name="count" type="number" min={1} required className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface" />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-on-surface">
                  Hours Active
                  <input name="hoursActive" type="number" step="0.01" min={0} required className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface" />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-on-surface">
                  Remarks
                  <input name="remarks" className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface" />
                </label>
              </>
            ) : null}

            {type === 'expense' ? (
              <>
                <label className="grid gap-2 text-sm font-semibold text-on-surface">
                  Description
                  <input name="description" required className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface" />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-on-surface">
                  Amount
                  <input name="amount" type="number" step="0.01" min={0} required className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface" />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-on-surface">
                  Category
                  <select name="category" defaultValue="Labour" className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface">
                    <option value="Labour">Labour</option>
                    <option value="Materials">Materials</option>
                    <option value="Equipment">Equipment</option>
                    <option value="Misc">Misc</option>
                  </select>
                </label>
              </>
            ) : null}

            {type === 'incident' ? (
              <>
                <label className="grid gap-2 text-sm font-semibold text-on-surface">
                  Incident Type
                  <select name="incidentType" defaultValue="Safety" className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface">
                    <option value="Safety">Safety</option>
                    <option value="Block">Block</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-semibold text-on-surface">
                  Severity
                  <select name="severity" defaultValue="Low" className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface">
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-semibold text-on-surface">
                  Description
                  <input name="description" required className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface" />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-on-surface">
                  Duration Estimate (minutes)
                  <input name="durationEstimate" type="number" min={0} className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface" />
                </label>
              </>
            ) : null}

            <button
              type="submit"
              className="rounded-full bg-machined-gradient px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary/20 disabled:opacity-60"
              disabled={loading}
            >
              Submit
            </button>
          </div>
        </form>
      ) : null}

      {(type === 'labour' || type === 'material') ? (
        <form onSubmit={onSubmitTransfer} className="rounded-[1.75rem] border border-outline-variant bg-surface p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
          <h3 className="text-lg font-black text-on-surface">Transfer {type === 'labour' ? 'Labour' : 'Material'} to another site</h3>
          <p className="mt-1 text-sm text-on-surface-variant">Transfer requests are submitted as Pending and require admin approval.</p>
          <div className="mt-4 grid gap-3">
            <input type="hidden" name="resourceType" value={type === 'labour' ? 'Labour' : 'Materials'} />
            <label className="grid gap-2 text-sm font-semibold text-on-surface">
              Destination Site
              <select name="toSiteId" required className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface">
                <option value="">Select destination</option>
                {sitesResult?.ok ? sitesResult.data.filter((site) => site.siteId !== siteId).map((site) => (
                  <option key={site.siteId} value={site.siteId}>{site.name} ({site.location})</option>
                )) : null}
              </select>
            </label>
            {type === 'labour' ? (
              <label className="grid gap-2 text-sm font-semibold text-on-surface">
                Work Type
                <select name="workTypeEnum" required className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface">
                  <option value="Steel work">Steel work</option>
                  <option value="Shuttering">Shuttering</option>
                  <option value="Brick work">Brick work</option>
                  <option value="Concrete work">Concrete work</option>
                  <option value="Plastering">Plastering</option>
                  <option value="Electric work">Electric work</option>
                  <option value="Plumbing">Plumbing</option>
                  <option value="Tile work">Tile work</option>
                  <option value="Wood work">Wood work</option>
                  <option value="Paint work">Paint work</option>
                </select>
              </label>
            ) : (
              <>
                <label className="grid gap-2 text-sm font-semibold text-on-surface">
                  Material Type
                  <select name="materialTypeEnum" required className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface">
                    <option value="Cement">Cement</option>
                    <option value="M sand">M sand</option>
                    <option value="P sand">P sand</option>
                    <option value="Metal">Metal</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-semibold text-on-surface">
                  Unit (Custom Unit UUID)
                  <input name="unitCustomId" required placeholder="Unit UUID" className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface" />
                </label>
              </>
            )}
            <label className="grid gap-2 text-sm font-semibold text-on-surface">
              Quantity
              <input name="quantity" type="number" min={1} step="0.01" required className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface" />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-on-surface">
              Remarks
              <input name="remarks" className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface" />
            </label>
            <button type="submit" className="rounded-full bg-machined-gradient px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary/20">
              Submit Transfer Request
            </button>
          </div>
          {transferState && !transferState.ok ? (
            transferState.kind === 'endpoint_unavailable' ? (
              <ApiUnavailableBanner endpoint={transferState.endpoint} method={transferState.method} />
            ) : (
              <div className="mt-3 rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">{transferState.message}</div>
            )
          ) : null}
          {transferState?.ok ? (
            <div className="mt-3 rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">Transfer request submitted.</div>
          ) : null}
        </form>
      ) : null}

      <section className="rounded-[1.75rem] border border-outline-variant bg-surface p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-black text-on-surface">
            {type === 'all' ? 'All entries' : `${type} entries`}
          </h3>
          <span className="rounded-full bg-surface-container-low px-3 py-1 text-[10px] font-black uppercase tracking-[0.28em] text-on-surface-variant">
            {loading ? 'Loading' : 'Live'}
          </span>
        </div>

        {entriesResult?.ok ? (
          type === 'all' ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {(['labour', 'material', 'machinery', 'expense', 'incident'] as const).map((group) => {
                const list = (entriesResult.data as Record<string, Entry[]>)[group] ?? [];
                return (
                  <div key={group} className="rounded-2xl bg-surface-container-low px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-black uppercase tracking-[0.24em] text-on-surface-variant">{group}</div>
                      <div className="rounded-full bg-surface px-3 py-1 text-xs font-bold">{list.length}</div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {list.slice(0, 3).map((entry) => (
                        <div key={entry.id} className="rounded-xl bg-surface px-3 py-2 text-sm">
                          <div className="font-bold text-on-surface">{summarizeEntry(entry, group)}</div>
                          <div className="text-xs text-on-surface-variant">{formatDate(entry.date ?? entry.createdAt ?? entry.timestamp)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              {entryList.length > 0 ? (
                entryList.map((entry) => (
                  <article key={entry.id} className="rounded-2xl bg-surface-container-low px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-black text-on-surface">{summarizeEntry(entry, type)}</div>
                        <div className="text-sm font-medium text-on-surface-variant">{formatDate(entry.date ?? entry.createdAt ?? entry.timestamp)}</div>
                      </div>
                      <div className="text-xs font-black uppercase tracking-[0.24em] text-on-surface-variant">{entry.id}</div>
                    </div>
                    <pre className="mt-3 overflow-x-auto text-xs text-on-surface-variant">{JSON.stringify(entry, null, 2)}</pre>
                  </article>
                ))
              ) : (
                <div className="rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-4 text-sm font-medium text-on-surface-variant">
                  No entries found for this type.
                </div>
              )}
            </div>
          )
        ) : (
          <div className="mt-4 rounded-2xl border border-outline-variant bg-surface-container-low px-4 py-4 text-sm font-medium text-on-surface-variant">
            Loading entries...
          </div>
        )}
      </section>
    </div>
  );
}
