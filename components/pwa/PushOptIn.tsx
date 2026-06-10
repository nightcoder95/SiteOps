'use client';

import { Bell, BellOff, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { requestJson } from '@/lib/http/client';
import { notifyError, toastSuccess } from '@/lib/ui/toast';
import { toast } from 'sonner';

// PWA6 — opt-in affordance for Web Push. Hidden entirely when the browser lacks
// Push support or VAPID isn't configured (no public key shipped). State mirrors
// the live PushManager subscription so the toggle is always truthful.

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

// Push expects the application server key as a Uint8Array, not base64url text.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    Boolean(VAPID_PUBLIC_KEY)
  );
}

export function PushOptIn() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported()) return;
    setSupported(true);
    void (async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(Boolean(sub));
    })();
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast('Notifications permission denied', { icon: '🔕' });
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY as string),
      });
      const json = sub.toJSON();
      const res = await requestJson('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!res.ok) {
        await sub.unsubscribe();
        notifyError(res);
        return;
      }
      setSubscribed(true);
      toastSuccess('Push notifications enabled');
    } catch {
      toast.error('Could not enable notifications');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await requestJson('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      toastSuccess('Push notifications disabled');
    } catch {
      toast.error('Could not disable notifications');
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={() => void (subscribed ? disable() : enable())}
      disabled={busy}
      aria-label={subscribed ? 'Disable push notifications' : 'Enable push notifications'}
      className="btn-secondary flex items-center gap-2 rounded-full px-3 py-1.5 disabled:opacity-50"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : subscribed ? (
        <BellOff className="h-4 w-4" />
      ) : (
        <Bell className="h-4 w-4" />
      )}
      {subscribed ? 'Push on' : 'Enable push'}
    </button>
  );
}
