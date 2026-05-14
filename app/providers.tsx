'use client';

import { createBrowserClient } from '@supabase/ssr';
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import 'sonner/dist/styles.css';

export default function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
    if (key && host && !posthog.__loaded) {
      posthog.init(key, {
        api_host: host,
        capture_pageview: false,
        autocapture: false,
        person_profiles: 'identified_only',
      });
    }
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
    <PHProvider client={posthog}>
      {children}
      <Toaster position="top-right" richColors closeButton />
    </PHProvider>
  );
}
