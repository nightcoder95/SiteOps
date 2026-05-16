// Dynamic import keeps posthog-js out of the initial bundle.
// All call sites (capture/init) wait on the same lazy load.
let posthogPromise: Promise<typeof import("posthog-js").default> | null = null;

function getPostHog() {
  if (!posthogPromise) {
    posthogPromise = import("posthog-js").then((m) => m.default);
  }
  return posthogPromise;
}

export async function initPostHog() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!key || !host) return;

  const posthog = await getPostHog();
  if (posthog.__loaded) return;
  posthog.init(key, {
    api_host: host,
    capture_pageview: false,
    autocapture: true,
    person_profiles: "identified_only",
  });
}

export function capture(event: string, properties?: Record<string, unknown>) {
  void getPostHog().then((posthog) => posthog.capture(event, properties));
}
