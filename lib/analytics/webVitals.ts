import { onCLS, onINP, onLCP, type Metric } from 'web-vitals';

// Step 0 of the snappiness work: report Core Web Vitals (LCP/INP/CLS) to PostHog
// so "native-snappy" has real field numbers to measure against before/after each
// perf change. Fire-and-forget; never blocks the UI.
export function reportWebVitals() {
  const send = (metric: Metric) => {
    void import('posthog-js').then(({ default: posthog }) => {
      if (!posthog.__loaded) return;
      posthog.capture('$web_vitals', {
        metric_name: metric.name,
        metric_value: metric.value,
        metric_rating: metric.rating,
        metric_delta: metric.delta,
        metric_id: metric.id,
        path: typeof window !== 'undefined' ? window.location.pathname : undefined,
      });
    });
  };

  onLCP(send);
  onINP(send);
  onCLS(send);
}
