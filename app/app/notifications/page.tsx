'use client';

import Link from 'next/link';
import { useEffect, useOptimistic, useState } from 'react';

import { ApiUnavailableBanner } from '@/components/ui/ApiUnavailableBanner';
import { PageHero, PageStack } from '@/components/ui/page-primitives';
import { requestJson, type ClientResult } from '@/lib/http/client';
import { toastClientError, toastSuccess } from '@/lib/ui/toast';

type Notification = {
  id: string;
  type: 'approval' | 'budget_alert' | 'incident' | 'system';
  title: string;
  message: string;
  readAt: string | null;
  linkToView: string | null;
  createdAt: string;
};

type NotificationsResponse = {
  items: Notification[];
  total: number;
  limit: number;
  offset: number;
};

export default function NotificationsPage() {
  const [result, setResult] = useState<ClientResult<NotificationsResponse> | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [optimisticItems, applyOptimistic] = useOptimistic(
    result?.ok ? result.data.items : ([] as Notification[]),
    (current, action: { kind: 'mark-one'; id: string } | { kind: 'mark-all' }) => {
      if (action.kind === 'mark-all') {
        return current.map((item) =>
          item.readAt ? item : { ...item, readAt: new Date().toISOString() },
        );
      }
      return current.map((item) =>
        item.id === action.id ? { ...item, readAt: new Date().toISOString() } : item,
      );
    },
  );

  async function load() {
    const next = await requestJson<NotificationsResponse>('/api/notifications?limit=50&offset=0&unreadOnly=false');
    setResult(next);
    return next;
  }

  useEffect(() => {
    let cancelled = false;

    async function initialLoad() {
      const next = await load();
      if (cancelled) return;
      setResult(next);
    }

    initialLoad();

    return () => {
      cancelled = true;
    };
  }, []);

  async function markRead(id: string) {
    applyOptimistic({ kind: 'mark-one', id });
    setRefreshing(true);
    const next = await requestJson(`/api/notifications/${id}`, {
      method: 'PATCH',
    });
    if (next.ok) {
      toastSuccess('Notification marked as read');
      await load();
    } else {
      toastClientError(next);
      setResult(next);
    }
    setRefreshing(false);
  }

  async function markAllRead() {
    applyOptimistic({ kind: 'mark-all' });
    setRefreshing(true);
    const next = await requestJson('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAllRead: true }),
    });
    if (next.ok) {
      toastSuccess('All notifications marked as read');
      await load();
    } else {
      toastClientError(next);
      setResult(next);
    }
    setRefreshing(false);
  }

  const items = optimisticItems;
  const unreadCount = items.filter((item) => !item.readAt).length;

  return (
    <PageStack>
      <PageHero
        eyebrow="Notifications"
        title="Unread alerts and actions"
        description="This screen uses live API data and shows an explicit endpoint message if the notifications route is missing."
      />

      {result && !result.ok && result.kind === 'endpoint_unavailable' ? (
        <ApiUnavailableBanner endpoint={result.endpoint} method={result.method} />
      ) : null}

      {result && !result.ok && result.kind !== 'endpoint_unavailable' ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          {result.message}
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-[1.5rem] border border-outline-variant bg-surface p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
          <div className="text-[10px] font-black uppercase tracking-[0.28em] text-on-surface-variant">Unread</div>
          <div className="mt-2 text-2xl font-black text-on-surface">{unreadCount}</div>
        </div>
        <div className="rounded-[1.5rem] border border-outline-variant bg-surface p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
          <div className="text-[10px] font-black uppercase tracking-[0.28em] text-on-surface-variant">Total</div>
          <div className="mt-2 text-2xl font-black text-on-surface">{result?.ok ? result.data.total : '—'}</div>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={markAllRead}
          disabled={refreshing || unreadCount === 0}
          className="rounded-full bg-machined-gradient px-4 py-3 text-sm font-black text-white shadow-lg shadow-primary/20 disabled:opacity-60"
        >
          Mark all as read
        </button>
      </div>

      <section className="grid gap-3">
        {items.length > 0 ? (
          items.map((notification) => (
            <article
              key={notification.id}
              className={[
                'rounded-[1.75rem] border p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]',
                notification.readAt ? 'border-outline-variant bg-surface' : 'border-primary/30 bg-primary-container/40',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black text-on-surface">{notification.title}</h3>
                  <p className="mt-1 text-sm font-medium text-on-surface-variant">{notification.message}</p>
                </div>
                <span className="rounded-full bg-surface px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-on-surface-variant">
                  {notification.type}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs font-medium text-on-surface-variant">
                <span>{new Date(notification.createdAt).toLocaleString()}</span>
                {notification.linkToView ? (
                  <Link href={notification.linkToView} className="font-black text-primary">
                    View
                  </Link>
                ) : null}
              </div>

              {!notification.readAt ? (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => markRead(notification.id)}
                    disabled={refreshing}
                    className="rounded-full bg-surface-container-low px-4 py-2 text-sm font-black text-on-surface"
                  >
                    Mark as read
                  </button>
                </div>
              ) : null}
            </article>
          ))
        ) : (
          <div className="rounded-3xl border border-outline-variant bg-surface px-4 py-6 text-sm font-medium text-on-surface-variant">
            {result?.ok ? 'No notifications found.' : 'Loading notifications...'}
          </div>
        )}
      </section>
    </PageStack>
  );
}
