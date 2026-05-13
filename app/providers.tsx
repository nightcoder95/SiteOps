'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

export default function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
    if (key && host && !posthog.__loaded) {
      posthog.init(key, {
        api_host: host,
        capture_pageview: false,
        autocapture: true,
        person_profiles: 'identified_only',
      });
    }
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
