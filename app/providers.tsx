'use client';

import { createBrowserClient } from '@supabase/ssr';
import { MotionConfig } from 'motion/react';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { SWRConfig } from 'swr';
import 'sonner/dist/styles.css';

import { reportWebVitals } from '@/lib/analytics/webVitals';
import { ConfirmHost } from '@/lib/ui/confirm';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import { SyncStatus } from '@/components/pwa/SyncStatus';

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
    reportWebVitals();
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

  // reducedMotion="user" makes every motion/react animation in the app honor
  // the OS "reduce motion" setting (WCAG 2.3.3) without touching each call site.
  return (
    <MotionConfig reducedMotion="user">
      {/* Client data cache (P2): dedupe in-flight requests, revalidate on focus,
          and don't auto-retry on error (the API codes drive user-facing copy). */}
      <SWRConfig value={{ revalidateOnFocus: true, dedupingInterval: 2000, shouldRetryOnError: false }}>
        {children}
        <ConfirmHost />
        <InstallPrompt />
        <SyncStatus />
        <Toaster position="top-right" richColors closeButton />
      </SWRConfig>
    </MotionConfig>
  );
}
