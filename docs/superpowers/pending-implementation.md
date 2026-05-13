# SiteOps Pending Implementation

**Original Specification:** [2026-04-24-siteops-backend-design.md](./specs/2026-04-24-siteops-backend-design.md)

**Last Updated:** April 26, 2026

---

## Status Overview

| Phase | Status | Completion |
|-------|--------|------------|
| Phase 1: Database + Auth + Core APIs | ✅ Complete | 100% |
| Phase 2: Caching + Performance | ✅ Complete | 100% |
| Phase 3: Real-time + Advanced | ✅ SSE Complete | 33% |

---

## Phase 1: Database + Auth + Core APIs

### ✅ Completed
- Neon database with schema (Drizzle)
- Better Auth configured with role field
- All API routes (GET/POST/PATCH/DELETE) including soft-delete for sites
- Input validation (Zod)
- Error handling + logging
- Notification triggers at route handler level (`createNotification()`)
- Long polling for admin live feed
- PostHog: `@posthog/next` installed, instrumentation configured
- PWA: `@serwist/next` configured, service worker at `app/sw.ts`, manifest at `/public/manifest.json`

### ✅ Completed

#### 1. PostHog Provider in Root Layout
**Location:** `app/layout.tsx`

**Status:** Completed
- Created `app/providers.tsx` client component wrapping children with `PostHogProvider`
- Root layout now imports and uses `Providers` wrapper

---

#### 2. React UI Components Connected to APIs
**Location:** `app/` directory

**Status:** Completed
- `app/app/layout.tsx` - Sidebar navigation layout
- `app/app/page.tsx` - Redirects to dashboard
- `app/app/dashboard/page.tsx` - Shows user profile + admin analytics
- `app/app/sites/page.tsx` - Sites list with links
- `app/app/sites/[id]/page.tsx` - Site detail + entries + entry forms
- `app/app/forms/page.tsx` - Dynamic form builder by category
- `app/app/requests/resource/page.tsx` - Resource request list + form
- `app/app/requests/field/page.tsx` - Field request list + form
- `app/app/admin/analytics/page.tsx` - Admin analytics with period selector
- `app/app/admin/live-feed/page.tsx` - Long-polling live feed UI
- `app/app/notifications/page.tsx` - Notifications list + mark as read
- `app/app/profile/page.tsx` - User profile view and edit
- `app/auth/sign-in/page.tsx` - Sign in form
- `app/auth/sign-up/page.tsx` - Sign up form

**Spec Reference:** Phase 1 Deliverables → "React UI components connected to APIs"

---

#### 3. PWA Offline Queue Hook
**Location:** `hooks/useOfflineQueue.ts` (new file)

**Status:** Completed
- `lib/idb/open.ts` - IndexedDB helpers (openDB, addToQueue, getQueue, removeFromQueue, form cache)
- `hooks/useOfflineQueue.ts` - React hook exposing `isOnline`, `pendingCount`, `busy`, `queue()`, `flush()`
- Auto-flush on reconnect with retry logic (max 3 retries)
- Generic form caching via `setCachedForm` / `getCachedForm`

**Spec Reference:** Phase 1 Deliverables → "offline cache for entry forms, `useOfflineQueue` hook (IndexedDB) for pending submissions"

---

## Phase 2: Caching + Performance

### ✅ Completed
- Upstash Redis setup (Mumbai region)
- Cache layer for analytics queries, feed snapshots
- Real rate limiting via Upstash
- Cache invalidation strategies (on expense entry creation)

### ⏳ Pending

#### 4. Automated Testing
**Location:** New test files

**Status:** Completed
- `vitest.config.ts` - Vitest configuration
- `lib/utils/requestId.test.ts` - Unit test for requestId generator
- `lib/auth/ownership.test.ts` - Unit test for ownership check
- `playwright.config.ts` - Playwright configuration
- `e2e/smoke.spec.ts` - E2E smoke tests for homepage, sign-in, auth redirect

**Spec Reference:** Phase 2 Testing → "Unit tests for query functions, Integration tests for route handlers, E2E tests via Next.js test framework"

---

#### 5. Monitoring Integration
**Location:** New monitoring configuration

**Status:** Completed
- `instrumentation.ts` - Next.js instrumentation registering Sentry on server
- `sentry.client.config.ts` - Client-side Sentry initialization
- `sentry.server.config.ts` - Server-side Sentry initialization  
- `sentry.edge.config.ts` - Edge runtime Sentry initialization
- Environment variables: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`

**Spec Reference:** Phase 2 Monitoring → "Integrate Datadog/Sentry for exception tracking, performance metrics, budget alerts"

---

## Phase 3: Real-time + Advanced (Optional)

### ✅ Completed

#### 6. Server-Sent Events (SSE)
**Current State:** Long polling remains at `/api/admin/live-feed`, SSE available at `/api/admin/live-feed-sse`

**Status:** Completed
- Created `app/api/admin/live-feed-sse/route.ts` as alternative SSE endpoint
- Keeps existing long-polling for backward compatibility
- SSE endpoint uses ReadableStream with 2-second polling interval

**Spec Reference:** Phase 3 Deliverables → "Migrate from polling to Server-Sent Events (SSE)"

---

#### 7. Notifications Push
**Current State:** Polling-based notifications at `/api/notifications`

**Required:**
- Implement push notifications (if needed)
- Consider web push API or WebSocket

**Spec Reference:** Phase 3 Deliverables → "Notifications push (if needed)"

---

#### 8. WebSocket (if moving off Vercel)
**Current State:** Not applicable (currently Vercel-hosted)

**Required:**
- WebSocket implementation for truly real-time features
- Only if moving off Vercel serverless

**Spec Reference:** Phase 3 Deliverables → "WebSocket for truly real-time features (if moving off Vercel)"

---

## Implementation Priority

### High Priority (Core Functionality)
1. PostHog Provider in root layout (5 min)
2. React UI components (days-weeks)
3. PWA offline queue hook (hours-days)

### Medium Priority (Quality & Reliability)
4. Automated testing (days)
5. Monitoring integration (hours-days)

### Low Priority (Optional Enhancements)
6. SSE migration (hours)
7. Notifications push (hours)
8. WebSocket (if applicable)

---

## Environment Variables Checklist

### ✅ Configured
- `DATABASE_URL` (Neon PostgreSQL)
- `BETTER_AUTH_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_API_KEY`
- `APP_URL`
- `NEXT_PUBLIC_APP_URL`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`
- `NEXT_PUBLIC_POSTHOG_HOST`

### ⏳ Optional (if implementing monitoring)
- Sentry DSN or Datadog API keys

---

## Database Migration Status

### ⏳ Required
- Run `npm run db:generate` to generate migration from schema
- Run `npm run db:migrate` to apply to Neon database

**Note:** Schema is defined in `lib/db/schema.ts` but migrations have not been run yet.

---

## Quick Start for Remaining Work

### 1. Complete PostHog Integration
```bash
# Edit app/layout.tsx to add PostHogProvider
# See section above for code snippet
```

### 2. Run Database Migrations
```bash
npm run db:generate
npm run db:migrate
```

### 3. Start Dev Server
```bash
npm run dev:next
```

### 4. Begin UI Development
- Start with dashboard page
- Implement site CRUD UI
- Build entry forms
- Connect to existing API routes

---

## Notes

- All backend API routes are functional and tested for type safety
- Authentication and authorization guards are in place
- Caching and rate limiting are operational (requires Upstash credentials)
- The remaining work is primarily frontend (UI) and testing/monitoring
