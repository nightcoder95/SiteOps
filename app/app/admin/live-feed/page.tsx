'use client';

import { createBrowserClient } from '@supabase/ssr';
import { useEffect, useMemo, useState } from 'react';

import type { ActivityItem } from '@/lib/types/domain';

type FeedState =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'error'; message: string };

type RealtimeInsertPayload = { new: Record<string, unknown> };

const FEED_SOURCES = [
  { table: 'labour_entries', type: 'labour' as const, idField: 'labour_entry_id' },
  { table: 'material_entries', type: 'material' as const, idField: 'material_entry_id' },
  { table: 'machinery_entries', type: 'machinery' as const, idField: 'machinery_entry_id' },
  { table: 'expense_entries', type: 'expense' as const, idField: 'expense_entry_id' },
  { table: 'incident_reports', type: 'incident' as const, idField: 'incident_report_id' },
];

const TYPE_META: Record<ActivityItem['type'], { icon: string; bg: string; fg: string }> = {
  labour: { icon: 'engineering', bg: 'bg-primary-container', fg: 'text-on-primary-container' },
  material: { icon: 'inventory_2', bg: 'bg-tertiary-container', fg: 'text-on-tertiary-container' },
  machinery: { icon: 'precision_manufacturing', bg: 'bg-secondary-container', fg: 'text-on-secondary-container' },
  expense: { icon: 'account_balance_wallet', bg: 'bg-primary-container', fg: 'text-on-primary-container' },
  incident: { icon: 'report', bg: 'bg-error-container', fg: 'text-on-error-container' },
};

function toActivityItem(payload: RealtimeInsertPayload, type: ActivityItem['type'], idField: string): ActivityItem | null {
  const row = payload.new;
  const id = typeof row[idField] === 'string' ? row[idField] : null;
  const siteId = typeof row.site_id === 'string' ? row.site_id : null;
  const createdAt = typeof row.created_at === 'string' ? row.created_at : null;
  if (!id || !siteId || !createdAt) return null;
  return { id, siteId, type, createdAt };
}

export default function AdminLiveFeedPage() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [state, setState] = useState<FeedState>({ kind: 'loading' });

  const supabase = useMemo(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !supabaseKey) return null;
    return createBrowserClient(supabaseUrl, supabaseKey);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setState({ kind: 'error', message: 'Supabase is not configured for live feed.' });
      return;
    }

    const channel = supabase.channel('admin-live-feed');
    FEED_SOURCES.forEach((source) => {
      channel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: source.table },
        (payload) => {
          const item = toActivityItem(payload as RealtimeInsertPayload, source.type, source.idField);
          if (!item) return;
          setActivities((prev) => [item, ...prev].slice(0, 200));
        },
      );
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setState({ kind: 'ready' });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setState({ kind: 'error', message: `Live feed channel error: ${status}` });
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase]);

  return (
    <div className="flex flex-col gap-density-medium">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="font-headline-sm text-headline-sm text-on-background">Live Feed</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">Real-time activity across all sites.</p>
        </div>
        <span
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-label-md text-label-md uppercase ${
            state.kind === 'ready'
              ? 'bg-primary-container text-on-primary-container'
              : 'bg-surface-container-low text-on-surface-variant'
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${state.kind === 'ready' ? 'bg-primary animate-pulse' : 'bg-outline'}`}
          />
          {state.kind === 'ready' ? 'Live' : state.kind === 'loading' ? 'Connecting' : 'Offline'}
        </span>
      </header>

      {state.kind === 'error' ? (
        <div className="rounded-xl border border-error-container bg-error-container/30 px-4 py-3 font-body-md text-body-md text-on-error-container">
          {state.message}
        </div>
      ) : null}

      <section className="divide-y divide-outline-variant rounded-xl border border-outline-variant bg-surface-container-lowest">
        {activities.length === 0 ? (
          <div className="p-4 font-body-md text-body-md text-on-surface-variant">
            {state.kind === 'loading' ? 'Connecting to live feed…' : 'No activity yet.'}
          </div>
        ) : (
          activities.map((activity) => {
            const meta = TYPE_META[activity.type];
            return (
              <article key={`${activity.type}-${activity.id}`} className="flex items-start gap-3 p-3">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.bg} ${meta.fg}`}>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                    {meta.icon}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-body-md text-body-md text-on-background">
                    <span className="font-semibold uppercase">{activity.type}</span> entry logged at site {activity.siteId}.
                  </p>
                  <p className="font-label-sm text-label-sm mt-0.5 text-on-surface-variant">
                    {new Date(activity.createdAt).toLocaleString()}
                  </p>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
