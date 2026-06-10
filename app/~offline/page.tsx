import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline — SiteOps",
};

// Branded fallback served by the service worker when a navigation request can't
// reach the network and the route isn't cached (PWA2). Registered as the
// serwist navigation fallback in app/sw.ts.
export default function OfflinePage() {
  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-6 text-center safe-area-top safe-area-bottom">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-container border border-outline mb-6">
        <span className="material-symbols-outlined text-3xl text-primary">cloud_off</span>
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight text-on-surface uppercase">
        You&apos;re offline
      </h1>
      <p className="mt-3 max-w-sm text-sm text-on-surface-variant font-medium">
        This screen isn&apos;t available without a connection. Your cached data is still here —
        reconnect to load anything new.
      </p>
    </div>
  );
}
