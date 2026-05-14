'use client';

import { createBrowserClient } from '@supabase/ssr';
import { useEffect, useMemo, useState } from 'react';

import type { ActivityItem } from '@/lib/types/domain';

type FeedState =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'error'; message: string };

type RealtimeInsertPayload = {
  new: Record<string, unknown>;
};

const FEED_SOURCES = [
  { table: 'labour_entries', type: 'labour' as const, idField: 'labour_entry_id' },
  { table: 'material_entries', type: 'material' as const, idField: 'material_entry_id' },
  { table: 'machinery_entries', type: 'machinery' as const, idField: 'machinery_entry_id' },
  { table: 'expense_entries', type: 'expense' as const, idField: 'expense_entry_id' },
  { table: 'incident_reports', type: 'incident' as const, idField: 'incident_report_id' },
];

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
        {
          event: 'INSERT',
          schema: 'public',
          table: source.table,
        },
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
    <div className="space-y-4">
      <section className="rounded-[2rem] bg-[linear-gradient(135deg,#fff7ed_0%,#fff_55%,#e2e8f0_100%)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-on-surface-variant">Live feed</p>
        <h2 className="mt-2 text-2xl font-black text-on-surface">Admin activity stream</h2>
        <p className="mt-2 max-w-2xl text-sm font-medium text-on-surface-variant">
          Real-time stream powered by Supabase Realtime channels.
        </p>
      </section>

      {state.kind === 'error' ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          {state.message}
        </div>
      ) : null}

      <section className="grid gap-3">
        {activities.length > 0 ? (
          activities.map((activity) => (
            <article key={activity.id} className="rounded-[1.75rem] border border-outline-variant bg-surface p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-black text-on-surface">{activity.type}</div>
                  <div className="text-sm font-medium text-on-surface-variant">Site {activity.siteId}</div>
                </div>
                <span className="text-xs font-medium text-on-surface-variant">
                  {new Date(activity.createdAt).toLocaleString()}
                </span>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-3xl border border-outline-variant bg-surface px-4 py-6 text-sm font-medium text-on-surface-variant">
            {state.kind === 'loading' ? 'Connecting to live feed...' : 'No activity yet.'}
          </div>
        )}
      </section>
    </div>
  );
}
