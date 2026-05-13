import posthog from "posthog-js";

export function initPostHog() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (!key || !host) {
    return;
  }

  posthog.init(key, {
    api_host: host,
    capture_pageview: false,
    autocapture: true,
    person_profiles: 'identified_only',
  });
}

export function capture(event: string, properties?: Record<string, unknown>) {
  posthog.capture(event, properties);
}
