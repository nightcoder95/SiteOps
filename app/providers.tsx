'use client';

import { createBrowserClient } from '@supabase/ssr';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import 'sonner/dist/styles.css';

import { ConfirmHost } from '@/lib/ui/confirm';

// Lazy-load and init PostHog after window load so analytics never blocks first paint.
function deferredInitPostHog() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!key || !host) return;
  void import('posthog-js').then(({ default: posthog }) => {
    if (posthog.__loaded) return;
    posthog.init(key, {
      api_host: host,
      capture_pageview: false,
      autocapture: false,
      person_profiles: 'identified_only',
    });
  });
}

export default function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (document.readyState === 'complete') {
      deferredInitPostHog();
      return;
    }
    const onLoad = () => deferredInitPostHog();
    window.addEventListener('load', onLoad, { once: true });
    return () => window.removeEventListener('load', onLoad);
  }, []);

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !supabaseKey) return;

    const supabase = createBrowserClient(supabaseUrl, supabaseKey);
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!('serviceWorker' in navigator)) return;
      navigator.serviceWorker.controller?.postMessage({
        type: 'AUTH_CHANGED',
        userId: session?.user?.id ?? null,
      });

      if (session?.user) return;
      void (async () => {
        const cacheKeys = await caches.keys();
        await Promise.all(
          cacheKeys
            .filter((name) => name.includes('siteops-api'))
            .map((name) => caches.delete(name)),
        );
      })();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <>
      {children}
      <ConfirmHost />
      <Toaster position="top-right" richColors closeButton />
    </>
  );
}
