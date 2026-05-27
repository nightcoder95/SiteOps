# PWA Installability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SiteOps reliably installable from supported mobile and desktop browsers, with a clear in-app install affordance and safe fallbacks for unsupported platforms.

**Architecture:** SiteOps already has a Next.js App Router shell, a web app manifest, and a Serwist service worker. This plan hardens those foundations, adds production-safe install prompt UX, improves icon compatibility, and verifies installability without changing core app behavior.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, Serwist service worker, Playwright, browser PWA APIs.

---

## Problem Statement

SiteOps is a mobile-first construction operations app, so users should be able to install it to the home screen and launch it like a native app. The codebase already includes the core PWA pieces:

- `app/layout.tsx` links `/manifest.json` through Next metadata and sets Apple web app metadata.
- `public/manifest.json` declares the app name, start URL, display mode, theme color, and SVG icons.
- `app/sw.ts` defines a Serwist service worker with page and API runtime caching.
- `next.config.ts` builds `app/sw.ts` to `public/sw.js` using `@serwist/next`.
- `middleware.ts` excludes `manifest.json`, `sw.js`, and icon assets from auth middleware.

The remaining problem is reliability and discoverability:

- Development mode disables Serwist, so installability must be tested from a production build.
- The manifest uses SVG icons only; PNG icons are more compatible for install prompts and iOS home screen usage.
- The manifest does not define `id`, `scope`, `description`, or maskable icon intent.
- Users may not notice browser-provided install UI, especially on mobile.
- iOS and some browsers cannot be prompted programmatically and need clear manual instructions.
- Auth redirects and offline caches must not leak user-specific data between accounts.

## Desired Behavior

- On Android Chrome, Edge, Samsung Internet, and supported desktop Chromium browsers, SiteOps should meet install criteria and show browser-provided install UI.
- Where `beforeinstallprompt` is supported, SiteOps should expose a small install CTA after the authenticated app shell loads.
- The install CTA should disappear once installed, dismissed, or when the browser cannot currently install the app.
- On iOS/iPadOS, SiteOps should show manual "Add to Home Screen" guidance only in browser mode and only when it is not already installed.
- Installed SiteOps should launch at `/app/dashboard`, use standalone display mode, keep safe-area handling, and use the correct app icon.
- Service worker and runtime caching should remain conservative around authenticated API data.

## Browser and Platform Edge Cases

- `beforeinstallprompt` is Chromium-specific and does not fire on iOS Safari.
- `beforeinstallprompt` does not fire if the app is already installed, the user has not met browser engagement heuristics, installability criteria are not met, or the current platform blocks install.
- The deferred prompt event can only be used once; after `prompt()` resolves, the app must clear it.
- iOS 16.4+ allows adding PWAs from the Share menu in multiple browsers, but still does not allow JavaScript to open the install prompt.
- Safari standalone mode should be detected with `window.matchMedia('(display-mode: standalone)')` and `navigator.standalone`.
- Local development with `npm run dev` will not register the Serwist worker because `next.config.ts` disables it in development.
- Authenticated `start_url` behavior must be intentional: unauthenticated users launching `/app/dashboard` should be redirected to `/auth/sign-in`, and authenticated users should land on the dashboard.
- If a user switches accounts, API caches must stay scoped or cleared. The existing `AUTH_CHANGED` service worker message and cache deletion behavior must remain intact.
- If the service worker update activates while the app is open, the install CTA should not reload the page unexpectedly.
- Adding an explicit `id` changes app identity. The current manifest has no `id`, so browsers derive it from `start_url: "/"`. If SiteOps already has installed users, they will not get an in-place update — confirm SiteOps is pre-launch or accept a one-time re-install.

## Security Requirements

- Do not cache admin live data or sensitive admin APIs for offline use.
- Do not cache user-specific API responses under shared cache keys. Keep or strengthen the existing user-scoped cache key strategy in `app/sw.ts`.
- Keep `manifest.json`, `sw.js`, and icon files outside auth middleware redirects.
- Do not include secrets, environment variables, user identifiers, or tenant identifiers in the manifest.
- Do not add broad service worker routes that cache all authenticated POST/PUT/PATCH/DELETE requests.
- Do not add inline scripts for install behavior; keep logic in React client components.
- Preserve CSP compatibility. The current CSP is report-only, but implementation should work if moved to enforcing mode.

## Performance Requirements

- Install prompt logic must be tiny and client-only.
- Do not block hydration, first paint, auth state loading, or route transitions.
- Do not eagerly import heavy dependencies for install UI.
- Use passive event-driven logic: listen for `beforeinstallprompt`, `appinstalled`, and display-mode checks.
- Keep service worker runtime caching bounded with expiration rules.
- Avoid prompting on every page load; persist dismissal in `localStorage` with a reasonable cooldown.

## File Structure

- Modify `public/manifest.json`: hardened manifest metadata, `id`, `scope`, richer PNG/maskable icons.
- Create `public/icons/maskable.svg`: maskable source SVG with the symbol in the central 80% safe zone.
- Create `scripts/generate-pwa-icons.mjs`: deterministic SVG-to-PNG icon generation script.
- Create `public/icons/icon-192.png`: production install icon.
- Create `public/icons/icon-512.png`: production install icon.
- Create `public/icons/maskable-192.png`: maskable install icon with safe padding.
- Create `public/icons/maskable-512.png`: maskable install icon with safe padding.
- Create `public/icons/apple-touch-icon.png`: iOS home screen icon.
- Modify `app/layout.tsx`: update metadata icon references and keep manifest link.
- Create `components/pwa/installPrompt.ts`: shared browser detection and install prompt types.
- Create `components/pwa/InstallAppPrompt.tsx`: client install CTA and iOS fallback UI.
- Modify `components/app-shell/AppShell.tsx`: render install CTA inside authenticated app shell (minimal diff — one import, one JSX line).
- Modify `app/sw.ts`: only if verification finds unsafe cache behavior; otherwise leave existing routing intact.
- Modify `playwright.config.ts`: point the E2E `webServer` at a production build so the service worker exists under test.
- Create `tests/pwa/installPrompt.test.ts`: unit tests for install prompt utility decisions.
- Create `e2e/pwa-installability.spec.ts`: production-mode checks for manifest, service worker, and install UI fallback behavior.

## Implementation Tasks

### Task 1: Harden the Manifest

**Files:**
- Modify: `public/manifest.json`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Update manifest metadata**

Replace `public/manifest.json` with:

```json
{
  "id": "/app",
  "name": "SiteOps",
  "short_name": "SiteOps",
  "description": "Mobile-first construction site operations app for field logs, approvals, transfers, and site oversight.",
  "start_url": "/app/dashboard",
  "scope": "/",
  "display": "standalone",
  "display_override": ["standalone", "minimal-ui"],
  "orientation": "portrait",
  "background_color": "#020617",
  "theme_color": "#020617",
  "categories": ["business", "productivity", "utilities"],
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/maskable-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/icons/maskable-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

- [ ] **Step 2: Update Next metadata icons**

In `app/layout.tsx`, change the `icons` block to:

```ts
  icons: {
    icon: [
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
```

- [ ] **Step 3: Type-check the layout change**

`npm run lint` runs `tsc --noEmit`; it type-checks the `app/layout.tsx` edit but does **not** validate `public/manifest.json` (JSON is not type-checked). Manifest correctness is verified by the E2E check in Task 6 and the DevTools check in Task 7.

Run:

```bash
npm run lint
```

Expected: TypeScript completes without errors.

### Task 2: Add PNG and Maskable Icons

**Files:**
- Create: `public/icons/maskable.svg`
- Create: `scripts/generate-pwa-icons.mjs`
- Create: `public/icons/icon-192.png`
- Create: `public/icons/icon-512.png`
- Create: `public/icons/maskable-192.png`
- Create: `public/icons/maskable-512.png`
- Create: `public/icons/apple-touch-icon.png`

- [ ] **Step 1: Add `sharp` as a dev dependency**

`sharp` rasterizes SVG to PNG deterministically on macOS, Linux, and CI. `qlmanage` is macOS-only, names output `<src>.svg.png`, and `-s` caps the *longest* edge (padding non-square output) — unsuitable for an exact-size, reproducible step.

```bash
npm install --save-dev sharp
```

- [ ] **Step 2: Create the maskable source SVG**

Maskable icons need the symbol inside the central 80 percent safe zone so launchers do not crop it. Create `public/icons/maskable.svg` by adapting `public/icons/icon-512.svg`:

- Canvas: same square `viewBox` as `icon-512.svg`.
- Background: full-bleed `#020617` rect, no transparency.
- Foreground: the existing orange SiteOps symbol, scaled to 80 percent and centered (10 percent padding on every side).

- [ ] **Step 3: Add the icon generation script**

Create `scripts/generate-pwa-icons.mjs`:

```js
import sharp from "sharp";

const jobs = [
  { src: "public/icons/icon-192.svg", out: "public/icons/icon-192.png", size: 192 },
  { src: "public/icons/icon-512.svg", out: "public/icons/icon-512.png", size: 512 },
  { src: "public/icons/maskable.svg", out: "public/icons/maskable-192.png", size: 192 },
  { src: "public/icons/maskable.svg", out: "public/icons/maskable-512.png", size: 512 },
  { src: "public/icons/apple-touch-icon.svg", out: "public/icons/apple-touch-icon.png", size: 180 },
];

for (const { src, out, size } of jobs) {
  await sharp(src, { density: 384 })
    .resize(size, size, { fit: "cover" })
    .png()
    .toFile(out);
  console.log(`generated ${out} (${size}x${size})`);
}
```

Run it:

```bash
node scripts/generate-pwa-icons.mjs
```

The three existing SVGs (`icon-192.svg`, `icon-512.svg`, `apple-touch-icon.svg`) plus the new `maskable.svg` stay in the repo as the script's source material — keep them; they are not orphaned.

- [ ] **Step 4: Verify dimensions**

Run:

```bash
sips -g pixelWidth -g pixelHeight public/icons/icon-192.png public/icons/icon-512.png public/icons/maskable-192.png public/icons/maskable-512.png public/icons/apple-touch-icon.png
```

Expected:

- `icon-192.png`: 192 x 192
- `icon-512.png`: 512 x 512
- `maskable-192.png`: 192 x 192
- `maskable-512.png`: 512 x 512
- `apple-touch-icon.png`: 180 x 180

### Task 3: Add Install Prompt Utilities

**Files:**
- Create: `components/pwa/installPrompt.ts`
- Test: `tests/pwa/installPrompt.test.ts`

- [ ] **Step 1: Create install prompt utility module**

Create `components/pwa/installPrompt.ts`:

```ts
export type BeforeInstallPromptEvent = Event & {
  readonly platforms?: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt: () => Promise<void>;
};

export type InstallPlatform = "chromium" | "ios" | "installed" | "unsupported";

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;

  const standaloneMedia = window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
  const navigatorStandalone =
    "standalone" in window.navigator &&
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

  return standaloneMedia || navigatorStandalone;
}

export function isIosLikeUserAgent(userAgent: string): boolean {
  return /iphone|ipad|ipod/i.test(userAgent);
}

export function getInstallPlatform(userAgent: string, standalone: boolean): InstallPlatform {
  if (standalone) return "installed";
  if (isIosLikeUserAgent(userAgent)) return "ios";
  // iOS is returned above, so CriOS/FxiOS never reach here — the Chromium
  // check only needs desktop/Android engine tokens.
  if (/chrome|edg|samsungbrowser|opr\//i.test(userAgent)) return "chromium";
  return "unsupported";
}

export function shouldSuppressInstallPrompt(now: number, dismissedAt: number | null): boolean {
  if (dismissedAt === null) return false;
  const cooldownMs = 1000 * 60 * 60 * 24 * 14;
  return now - dismissedAt < cooldownMs;
}
```

- [ ] **Step 2: Add unit tests**

Create `tests/pwa/installPrompt.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  getInstallPlatform,
  isIosLikeUserAgent,
  shouldSuppressInstallPrompt,
} from "@/components/pwa/installPrompt";

describe("install prompt utilities", () => {
  it("detects iOS user agents", () => {
    expect(isIosLikeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(true);
    expect(isIosLikeUserAgent("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe(true);
    expect(isIosLikeUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/124")).toBe(false);
  });

  it("classifies installed display mode first", () => {
    expect(getInstallPlatform("Mozilla/5.0 (iPhone)", true)).toBe("installed");
    expect(getInstallPlatform("Mozilla/5.0 Chrome/124", true)).toBe("installed");
  });

  it("classifies iOS browser mode separately from Chromium", () => {
    expect(getInstallPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) CriOS/124", false)).toBe("ios");
  });

  it("classifies supported Chromium-like browsers", () => {
    expect(getInstallPlatform("Mozilla/5.0 Chrome/124", false)).toBe("chromium");
    expect(getInstallPlatform("Mozilla/5.0 Edg/124", false)).toBe("chromium");
    expect(getInstallPlatform("Mozilla/5.0 SamsungBrowser/24", false)).toBe("chromium");
  });

  it("suppresses prompt only during cooldown", () => {
    const now = 1_000_000;
    expect(shouldSuppressInstallPrompt(now, null)).toBe(false);
    expect(shouldSuppressInstallPrompt(now, now - 1_000)).toBe(true);
    expect(shouldSuppressInstallPrompt(now, now - 1000 * 60 * 60 * 24 * 15)).toBe(false);
  });
});
```

- [ ] **Step 3: Run utility tests**

Run:

```bash
npm run test -- tests/pwa/installPrompt.test.ts
```

Expected: All tests pass.

### Task 4: Add Authenticated Install CTA

**Files:**
- Create: `components/pwa/InstallAppPrompt.tsx`
- Modify: `components/app-shell/AppShell.tsx`

- [ ] **Step 1: Create the client install component**

Create `components/pwa/InstallAppPrompt.tsx`:

```tsx
"use client";

import { Download, Share2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  type BeforeInstallPromptEvent,
  getInstallPlatform,
  isStandaloneDisplay,
  shouldSuppressInstallPrompt,
} from "./installPrompt";

const DISMISSED_AT_KEY = "siteops.installPrompt.dismissedAt";

// localStorage can throw in Safari private mode or when storage is disabled.
// Fall back to session-only behavior instead of crashing the component.
function readDismissedAt(): number | null {
  try {
    const raw = window.localStorage.getItem(DISMISSED_AT_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

function writeDismissedAt(value: number): void {
  try {
    window.localStorage.setItem(DISMISSED_AT_KEY, String(value));
  } catch {
    // Storage unavailable — dismissal persists for this session only.
  }
}

export function InstallAppPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [userAgent, setUserAgent] = useState("");
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setUserAgent(window.navigator.userAgent);
    setStandalone(isStandaloneDisplay());

    setDismissedAt(readDismissedAt());

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const platform = useMemo(
    () => getInstallPlatform(userAgent, installed || standalone),
    [installed, standalone, userAgent],
  );

  const suppressed = shouldSuppressInstallPrompt(Date.now(), dismissedAt);
  const showChromiumPrompt = platform === "chromium" && promptEvent !== null && !suppressed;
  const showIosFallback = platform === "ios" && !suppressed;

  if (!showChromiumPrompt && !showIosFallback) return null;

  const dismiss = () => {
    const now = Date.now();
    writeDismissedAt(now);
    setDismissedAt(now);
  };

  return (
    <section
      className="mx-auto mb-4 flex w-full max-w-7xl items-center justify-between gap-3 rounded border border-white/10 bg-slate-900/95 px-3 py-2 text-sm text-slate-100 shadow-lg"
      aria-label="Install SiteOps app"
    >
      <div className="flex min-w-0 items-center gap-2">
        {showIosFallback ? (
          <Share2 className="h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
        ) : (
          <Download className="h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
        )}
        <p className="min-w-0 text-xs leading-5 text-slate-200">
          {showIosFallback
            ? "Install SiteOps from the browser share menu using Add to Home Screen."
            : "Install SiteOps for faster access from your home screen."}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {showChromiumPrompt ? (
          <button
            type="button"
            className="rounded bg-sky-400 px-3 py-1.5 text-xs font-bold uppercase text-slate-950"
            onClick={async () => {
              try {
                await promptEvent.prompt();
                await promptEvent.userChoice;
              } catch {
                // prompt() rejects if the event was already consumed — clear it
                // either way so a fresh beforeinstallprompt can replace it.
              } finally {
                setPromptEvent(null);
              }
            }}
          >
            Install
          </button>
        ) : null}
        <button
          type="button"
          className="rounded p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Render the prompt in the app shell**

`components/app-shell/AppShell.tsx` is already a client component. Make a minimal diff — keep the file's existing single-quote style and change nothing else. Add the import alongside the existing imports:

```tsx
import { InstallAppPrompt } from '@/components/pwa/InstallAppPrompt';
```

Render the CTA as the first child of `<main>`:

```tsx
      <main className="flex-1 pb-24 pt-[calc(env(safe-area-inset-top)+4.5rem)] px-4 max-w-7xl mx-auto w-full">
        <InstallAppPrompt />
        {children}
      </main>
```

- [ ] **Step 3: Run type checking**

Run:

```bash
npm run lint
```

Expected: TypeScript completes without errors.

### Task 5: Verify Service Worker Safety

**Files:**
- Inspect: `app/sw.ts`
- Inspect: `app/providers.tsx`
- Inspect: `middleware.ts`
- Modify: `app/sw.ts` only if verification fails

- [ ] **Step 1: Confirm public assets bypass auth middleware**

Verify `middleware.ts` matcher excludes:

- `_next/static`
- `_next/image`
- `favicon.ico`
- `icons`
- `manifest.json`
- `sw.js`
- image file extensions

Expected: install assets are publicly fetchable before login.

- [ ] **Step 2: Confirm sensitive routes are not cached**

Verify `app/sw.ts` excludes admin routes from the API cache matcher:

```ts
!url.pathname.startsWith("/api/admin")
```

Expected: admin and live feed APIs are not cached by the SiteOps API cache rule. Note: the existing code also has a `!url.pathname.startsWith("/api/admin/live-feed")` clause — that path already starts with `/api/admin`, so the clause is fully redundant. Harmless; may be removed for clarity.

- [ ] **Step 3: Confirm user-scoped API cache behavior**

Verify `app/sw.ts` keeps:

```ts
url.searchParams.set("_u", currentUserId || "anon");
```

Expected: user-specific GET API responses do not share the same cache key after `AUTH_CHANGED`.

- [ ] **Step 4: Confirm auth changes clear API cache**

Verify `app/providers.tsx` posts:

```ts
navigator.serviceWorker.controller?.postMessage({
  type: "AUTH_CHANGED",
  userId: session?.user?.id ?? null,
});
```

Expected: service worker receives auth changes and clears `siteops-api-v1` when user identity changes.

### Task 6: Add E2E Installability Checks

**Files:**
- Modify: `playwright.config.ts`
- Create: `e2e/pwa-installability.spec.ts`

- [ ] **Step 1: Point Playwright at a production build**

`app/sw.ts` only builds to `public/sw.js` in production — `next.config.ts` disables Serwist in development. The current `playwright.config.ts` `webServer` runs `npm run dev`, so `/sw.js` would 404 under test (and CI, with `reuseExistingServer: false`, always runs dev). Change the `webServer` block in `playwright.config.ts`:

```ts
  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
```

This runs every E2E spec against a production build — the only honest target for service worker behavior. The longer `timeout` covers the build step.

- [ ] **Step 2: Add Playwright checks**

Create `e2e/pwa-installability.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("serves a valid install manifest", async ({ request }) => {
  const response = await request.get("/manifest.json");
  expect(response.ok()).toBe(true);

  const manifest = await response.json();
  expect(manifest.name).toBe("SiteOps");
  expect(manifest.short_name).toBe("SiteOps");
  expect(manifest.start_url).toBe("/app/dashboard");
  expect(manifest.scope).toBe("/");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }),
      expect.objectContaining({ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }),
      expect.objectContaining({ src: "/icons/maskable-512.png", purpose: "maskable" }),
    ]),
  );
});

test("serves service worker without auth redirect", async ({ request }) => {
  const response = await request.get("/sw.js");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("javascript");
  const body = await response.text();
  expect(body).toContain("siteops-api-v1");
});

test("serves install icons without auth redirect", async ({ request }) => {
  for (const iconPath of [
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/maskable-192.png",
    "/icons/maskable-512.png",
    "/icons/apple-touch-icon.png",
  ]) {
    const response = await request.get(iconPath);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
});
```

- [ ] **Step 3: Run E2E checks**

Run:

```bash
npm run test:e2e -- e2e/pwa-installability.spec.ts
```

Playwright builds and starts the production server via `webServer`, then runs the spec — no manual server step needed.

Expected:

- Manifest is reachable and contains required fields.
- `sw.js` is reachable without auth redirect.
- PNG icons are reachable without auth redirect.

### Task 7: Manual Production Verification

**Files:**
- No file changes

- [ ] **Step 1: Verify service worker registration**

Run production locally:

```bash
npm run build
npm run start
```

Open `http://localhost:3000` in Chrome.

Expected in DevTools > Application:

- Manifest shows no installability errors.
- Service worker is registered for scope `/`.
- `display` is `standalone`.
- Icons render correctly.

- [ ] **Step 2: Verify Android Chrome behavior**

Open the deployed HTTPS URL on Android Chrome.

Expected:

- Browser offers install through menu or install chip after engagement criteria are met.
- In-app install CTA appears only when `beforeinstallprompt` fires.
- Tapping Install opens the browser install prompt.
- After install, app launches to `/app/dashboard`.

- [ ] **Step 3: Verify iOS behavior**

Open the deployed HTTPS URL on iOS Safari.

Expected:

- No JavaScript install prompt appears.
- iOS fallback copy appears in browser mode.
- Fallback copy is absent when launched from home screen.
- Home screen icon uses `apple-touch-icon.png`.

- [ ] **Step 4: Verify auth and cache safety**

Test with two different users.

Expected:

- User A cached dashboard/API data is not visible after User B signs in.
- Admin-only live feed and admin APIs are not served stale from cache.
- Sign-out clears SiteOps API cache entries.

## Error Handling Plan

- If `beforeinstallprompt` never fires, render nothing on non-iOS browsers; do not show a broken install button.
- If `prompt()` rejects, clear the saved event and allow the browser to fire a new event later.
- If `localStorage` is unavailable, catch storage errors and keep the prompt session-only.
- If icon files fail to load, Playwright installability tests fail before deployment.
- If service worker registration fails, Chrome DevTools and Lighthouse catch it; the app still works as a normal web app.
- If the app is already installed, display-mode detection hides the CTA.
- If the user dismisses the CTA, suppress it for 14 days to avoid repeated prompts.

## Security Review Checklist

- [ ] Manifest contains no secrets, user IDs, tenant IDs, internal URLs, or environment values.
- [ ] `middleware.ts` allows public access to install assets but does not widen access to private app routes.
- [ ] Service worker does not cache authenticated mutations.
- [ ] Service worker does not cache admin live feed or admin API responses.
- [ ] API cache keys remain user-scoped.
- [ ] Auth change handling still clears API cache.
- [ ] No new inline scripts are introduced.

## Performance Review Checklist

- [ ] Install CTA is rendered only in the authenticated app shell.
- [ ] Install CTA uses event listeners and does not poll.
- [ ] No heavy package is added for PWA install prompting.
- [ ] Icon files are cacheable static assets.
- [ ] Service worker runtime cache expiration remains bounded.
- [ ] Production build size does not meaningfully increase.

## Rollback Plan

If install prompt UX causes issues, revert only:

- `components/pwa/installPrompt.ts`
- `components/pwa/InstallAppPrompt.tsx`
- `components/app-shell/AppShell.tsx` prompt render line
- `tests/pwa/installPrompt.test.ts`

Keep manifest and icon hardening unless those files are the source of the issue, because they improve browser compatibility independently of the CTA.

## Implementation Order

1. Harden manifest metadata.
2. Add PNG and maskable icons.
3. Add install prompt utility tests.
4. Add install CTA component.
5. Render CTA in authenticated app shell.
6. Add E2E installability checks.
7. Run production build and browser verification.
8. Deploy to HTTPS staging and test Android/iOS manually.

## References

- Chrome/web.dev install criteria: https://web.dev/articles/install-criteria
- web.dev install prompt behavior: https://web.dev/learn/pwa/installation-prompt
- MDN installability guide: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
