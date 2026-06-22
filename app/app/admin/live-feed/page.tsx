'use client';

import { createBrowserClient } from '@supabase/ssr';
import { useEffect, useMemo, useState } from 'react';

import type { ActivityItem } from '@/lib/types/domain';
import { formatDateTime } from '@/lib/utils/formatDate';

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
  material: { icon: 'inventory_2', bg: 'bg-amber-500/15', fg: 'text-amber-300' },
  machinery: { icon: 'precision_manufacturing', bg: 'bg-slate-500/15', fg: 'text-slate-300' },
  expense: { icon: 'account_balance_wallet', bg: 'bg-primary-container', fg: 'text-on-primary-container' },
  incident: { icon: 'report', bg: 'bg-red-500/10', fg: 'text-red-300' },
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
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Live Feed</h2>
          <p className="text-sm text-on-surface-variant">Real-time activity across all sites.</p>
        </div>
        <span
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase ${
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
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {state.message}
        </div>
      ) : null}

      <section className="divide-y divide-outline-variant rounded-xl border border-outline-variant bg-surface-container-lowest">
        {activities.length === 0 ? (
          <div className="p-4 text-sm text-on-surface-variant">
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
                  <p className="text-sm text-white">
                    <span className="font-semibold uppercase">{activity.type}</span> entry logged at site {activity.siteId}.
                  </p>
                  <p className="text-[10px] font-semibold mt-0.5 text-on-surface-variant">
                    {formatDateTime(activity.createdAt)}
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
