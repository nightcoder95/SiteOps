/// <reference lib="webworker" />

import { defaultCache } from "@serwist/next/worker";
import {
  ExpirationPlugin,
  NetworkFirst,
  Serwist,
  StaleWhileRevalidate,
  type PrecacheEntry,
} from "serwist";

declare global {
  interface WorkerGlobalScope {
    __SW_MANIFEST: Array<PrecacheEntry | string>;
  }
}

declare const self: ServiceWorkerGlobalScope;

const API_CACHE = "siteops-api-v1";
const PAGE_CACHE = "siteops-pages-v1";

let currentUserId = "anon";

const userScopedCachePlugin = {
  cacheKeyWillBeUsed: async ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    url.searchParams.set("_u", currentUserId || "anon");
    return new Request(url.toString(), request);
  },
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching: [
    {
      matcher: ({ request, sameOrigin, url }) =>
        sameOrigin &&
        request.method === "GET" &&
        url.pathname.startsWith("/api/") &&
        !url.pathname.startsWith("/api/admin/live-feed"),
      handler: new StaleWhileRevalidate({
        cacheName: API_CACHE,
        plugins: [
          userScopedCachePlugin,
          new ExpirationPlugin({
            maxEntries: 200,
            maxAgeSeconds: 60,
          }),
        ],
      }),
    },
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: PAGE_CACHE,
        networkTimeoutSeconds: 3,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 40,
            maxAgeSeconds: 60 * 60 * 24,
          }),
        ],
      }),
    },
    ...defaultCache,
  ],
});

self.addEventListener("message", (event) => {
  const data = event.data as { type?: string; userId?: string | null } | undefined;
  if (!data || data.type !== "AUTH_CHANGED") return;

  const nextUserId = data.userId ?? "anon";
  if (nextUserId === currentUserId) return;

  currentUserId = nextUserId;

  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name === API_CACHE)
          .map((name) => caches.delete(name)),
      );
    })(),
  );
});

serwist.addEventListeners();
