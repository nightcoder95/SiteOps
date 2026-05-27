'use client';

import Link from 'next/link';
import { useEffect, useOptimistic, useState } from 'react';

import { ApiUnavailableBanner } from '@/components/ui/ApiUnavailableBanner';
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

const TYPE_META: Record<Notification['type'], { icon: string; bg: string; fg: string }> = {
  approval: { icon: 'fact_check', bg: 'bg-primary-container', fg: 'text-on-primary-container' },
  budget_alert: { icon: 'account_balance_wallet', bg: 'bg-amber-500/15', fg: 'text-amber-300' },
  incident: { icon: 'report', bg: 'bg-red-500/10', fg: 'text-red-300' },
  system: { icon: 'campaign', bg: 'bg-slate-500/15', fg: 'text-slate-300' },
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
    (async () => {
      const next = await load();
      if (!cancelled) setResult(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function markRead(id: string) {
    applyOptimistic({ kind: 'mark-one', id });
    setRefreshing(true);
    const next = await requestJson(`/api/notifications/${id}`, { method: 'PATCH' });
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
    <div className="space-y-5 pb-20">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-on-surface">Alerts</h2>
          <p className="text-sm text-on-surface-variant">
            {unreadCount} unread of {result?.ok ? result.data.total : items.length}
          </p>
        </div>
        <button
          type="button"
          onClick={markAllRead}
          disabled={refreshing || unreadCount === 0}
          className="btn-secondary rounded-full px-3 py-1.5 disabled:opacity-50"
        >
          Mark all read
        </button>
      </header>

      {result && !result.ok && result.kind === 'endpoint_unavailable' ? (
        <ApiUnavailableBanner endpoint={result.endpoint} method={result.method} />
      ) : null}
      {result && !result.ok && result.kind !== 'endpoint_unavailable' ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {result.message}
        </div>
      ) : null}

      <section className="card-standard divide-y divide-outline-variant rounded-2xl">
        {items.length === 0 ? (
          <div className="p-4 text-sm text-on-surface-variant">
            {result?.ok ? 'No notifications found.' : 'Loading…'}
          </div>
        ) : (
          items.map((notification) => {
            const meta = TYPE_META[notification.type] ?? TYPE_META.system;
            const unread = !notification.readAt;
            return (
              <article key={notification.id} className={`flex items-start gap-3 p-4 ${unread ? '' : 'opacity-60'}`}>
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${meta.bg} ${meta.fg}`}>
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                    {meta.icon}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-on-surface">{notification.title}</h3>
                    {unread ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="unread" /> : null}
                  </div>
                  <p className="mt-0.5 text-sm text-on-surface-variant">{notification.message}</p>
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs text-on-surface-variant">
                    <span>{new Date(notification.createdAt).toLocaleString()}</span>
                    <div className="flex items-center gap-3">
                      {notification.linkToView ? (
                        <Link href={notification.linkToView} className="text-xs font-semibold uppercase text-primary">
                          View
                        </Link>
                      ) : null}
                      {unread ? (
                        <button
                          type="button"
                          onClick={() => markRead(notification.id)}
                          disabled={refreshing}
                          className="text-xs font-semibold uppercase text-primary"
                        >
                          Mark read
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
