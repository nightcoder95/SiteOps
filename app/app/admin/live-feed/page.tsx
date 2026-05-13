'use client';

import { useEffect, useRef, useState } from 'react';

import { ApiUnavailableBanner } from '@/components/ui/ApiUnavailableBanner';
import type { ActivityItem } from '@/lib/types/domain';

type FeedState =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'endpoint_unavailable'; endpoint: string; method: string; message: string }
  | { kind: 'error'; message: string };

export default function AdminLiveFeedPage() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [state, setState] = useState<FeedState>({ kind: 'loading' });
  const lastIdRef = useRef<string>('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      if (!active) return;

      const params = new URLSearchParams();
      if (lastIdRef.current) params.set('lastActivityId', lastIdRef.current);

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      try {
        const res = await fetch(`/api/admin/live-feed?${params.toString()}`, {
          cache: 'no-store',
          signal: abortRef.current.signal,
        });

        if (!active) return;

        if (res.status === 404 || res.status === 405) {
          setState({
            kind: 'endpoint_unavailable',
            endpoint: '/api/admin/live-feed',
            method: 'GET',
            message: 'Live feed endpoint is unavailable',
          });
          return;
        }

        if (res.status === 204) {
          setState({ kind: 'ready' });
          timer = setTimeout(poll, 3000);
          return;
        }

        const json = (await res.json()) as { success: boolean; data?: ActivityItem[]; error?: { message?: string } };
        if (!active) return;

        if (!json.success) {
          setState({ kind: 'error', message: json.error?.message ?? 'Live feed error' });
          timer = setTimeout(poll, 5000);
          return;
        }

        const newItems = json.data || [];
        if (newItems.length > 0) {
          setActivities((prev) => [...newItems, ...prev].slice(0, 200));
          lastIdRef.current = newItems[0].createdAt;
        }
        setState({ kind: 'ready' });
        timer = setTimeout(poll, 3000);
      } catch (error: any) {
        if (!active) return;
        if (error?.name === 'AbortError') {
          timer = setTimeout(poll, 0);
          return;
        }
        setState({ kind: 'error', message: error?.message ?? 'Poll error' });
        timer = setTimeout(poll, 5000);
      }
    }

    poll();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, []);

  return (
    <div className="space-y-4">
      <section className="rounded-[2rem] bg-[linear-gradient(135deg,#fff7ed_0%,#fff_55%,#e2e8f0_100%)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-on-surface-variant">Live feed</p>
        <h2 className="mt-2 text-2xl font-black text-on-surface">Admin activity stream</h2>
        <p className="mt-2 max-w-2xl text-sm font-medium text-on-surface-variant">
          The page keeps polling the live feed API and surfaces an explicit banner when the endpoint is not available.
        </p>
      </section>

      {state.kind === 'endpoint_unavailable' ? (
        <ApiUnavailableBanner endpoint={state.endpoint} method={state.method} />
      ) : null}
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
            {state.kind === 'loading' ? 'Loading live feed...' : 'No activity yet.'}
          </div>
        )}
      </section>
    </div>
  );
}
