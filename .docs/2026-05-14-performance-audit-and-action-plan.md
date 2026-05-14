# SiteOps Web App Performance Audit & Action Plan (2026-05-14)

> **Revision history**
> - v1 (2026-05-14): original audit and 5-phase plan.
> - v2 (2026-05-14): principal-engineer review. Verified claims against code, removed over-engineering, added missed levers (PWA/service worker, optimistic UI, JWT-local-verify, Supabase Realtime), tightened scope, killed redundant items.

---

## Objective
Make web app feel "super snappy" — mobile-app perceptual speed — without rewriting to native. Audit covers APIs, DB, middleware/auth, caching, fetch strategy, PWA shell.

## Executive Summary
Yes, achievable. Biggest wins are architectural, not platform:
1. Auth duplication (5–6 `supabase.auth.getUser()` network calls per dashboard load).
2. Client-only mount fetching with `cache: 'no-store'` default.
3. No use of the PWA service worker for app-shell + API stale-while-revalidate (Serwist is wired but uses only `defaultCache`).
4. Polling-based admin realtime instead of Supabase Realtime push.

A focused web-first sprint comes before any Android rewrite — most current latency follows the user to any client.

---

## Principal-Engineer Review of v1 Plan

### Verified claims (kept)
| Claim | Evidence | Verdict |
|---|---|---|
| Middleware calls `getUser()` per request | [middleware.ts:30](../middleware.ts#L30) | True |
| Session helper also calls `getUser()` | [lib/auth/session.ts:26](../lib/auth/session.ts#L26) | True; *role lookup is already cached 300s, so the cost is the network call, not the DB* |
| Dashboard fans out 3 client requests on mount | [DashboardPageClient.tsx:46-67](../app/app/dashboard/DashboardPageClient.tsx#L46-L67) | True |
| Global fetch defaults to `no-store` | [lib/http/client.ts:79](../lib/http/client.ts#L79) | True |
| Dashboard marked `force-dynamic` | [app/app/dashboard/page.tsx:8](../app/app/dashboard/page.tsx#L8) | True |
| Live-feed long-poll 25 s, SSE 2 s | [live-feed/route.ts](../app/api/admin/live-feed/route.ts), [live-feed-sse/route.ts](../app/api/admin/live-feed-sse/route.ts) | True |
| `sites` indexed only on `supervisor_id` | [schema.ts:75](../lib/db/schema.ts#L75) | True |
| Redis silently bypasses when env missing | [lib/cache/redis.ts](../lib/cache/redis.ts) | True |

### Claims needing correction
- **"Some endpoints return full rows with `select().from(...)`"** — true, but `sites` is a small table (per-tenant). Don't blanket-project; only project on hot list endpoints (`entries`, `notifications`).
- **"Index currently only on `supervisor_id`"** — correct, but `sites` table is small. Plan rates this medium-priority; lower it. Real index wins live on `*_entries(site_id, date)` already in place — validate plans before adding more.

### Missed high-impact levers (added to v2)
1. **JWT local verification.** `supabase.auth.getUser()` makes a network call to Supabase Auth on every invocation. Switching to `supabase.auth.getClaims()` (asymmetric JWT, locally verified) collapses 5–6 network roundtrips per dashboard load to **zero**. This is the single largest perceived-latency fix in the codebase.
2. **Service worker app shell.** `@serwist/next` is wired but uses `defaultCache` only ([app/sw.ts](../app/sw.ts)). A stale-while-revalidate runtime caching policy for `/api/*` GETs + precached shell delivers instant repeat navigations — the core "mobile feel" we're chasing. v1 missed this entirely.
3. **Optimistic UI for writes.** Daily-entry forms, mark-notification-read, approval clicks — all currently round-trip before UI updates. React 19 `useOptimistic` + rollback on error is the dominant mobile-snappiness lever for write paths.
4. **Supabase Realtime channels.** Replace 2 s SSE polling and 25 s long-poll with `supabase.channel().on('postgres_changes')`. Removes DB churn, lower latency, fewer connections. Already a dependency.
5. **RSC-first data fetch.** Dashboard is `force-dynamic` (SSR) but still does client `useEffect` fetches — worst of both worlds. Fetch in the server component, pass via props, drop the mount waterfall.
6. **PostHog autocapture is on** ([app/providers.tsx:16](../app/providers.tsx#L16)). On mobile networks this is a measurable INP regression. Set `autocapture: false`, instrument explicitly.
7. **Skeleton loaders, not text.** "Loading managed sites..." text reads as broken on mobile. Skeletons + `Suspense` reduce perceived TTI even when actual TTI is unchanged.
8. **`Link` prefetch coverage.** Confirm Next `<Link>` prefetch (default on viewport) for dashboard → site cards. Free win.

### Over-engineering removed
- **Phase 0 at 2–3 days.** Cut to **half a day**: Vercel Speed Insights (one env var) + Drizzle query timing wrapper + cache hit/miss already logged. No custom dashboard.
- **Phase 5 CI synthetic checks.** Replace with Lighthouse CI on PR for dashboard + sites only. No synthetic infra.
- **"Implement client query cache (SWR or TanStack Query)"** — pick one, don't shop. With RSC + service worker SWR for `/api/*`, a client query cache becomes mostly redundant. Defer until measured need.
- **"Response compression/payload shaping."** Next.js gzips by default; Vercel does brotli at the edge. Skip unless payloads measurably exceed 50 KB.
- **"Backpressure/connection limits for SSE."** Moot if Phase 4 swaps SSE → Supabase Realtime.

### DRY / code-quality gaps v1 missed
- Every API route repeats the `requestId / try / catch / logError / errorResponse` envelope (33 routes). Wrap with a single `withApi(handler)` helper — drops ~10 LOC per route and centralizes timing instrumentation in one place (also serves Phase 0 baseline goal for free).
- `requireAuth` / `requireAdmin` / `requireSiteAccess` ([lib/auth/guards.ts](../lib/auth/guards.ts)) all repeat `getSessionFromRequest → null check`. Collapse into one parameterized guard.
- Dashboard's `/api/users/me` round-trip is wasted: `AppLayout` already resolves the session server-side ([app/app/layout.tsx:8](../app/app/layout.tsx#L8)). Pass user via RSC props or React context — one fewer request, no new endpoint needed.

### Security / correctness checks
- JWT-local-verify (`getClaims`) is the **secure** path — Supabase explicitly documents `getUser()` as a network call for paranoid contexts; `getClaims` verifies signature locally with the published JWKS. No security regression.
- Removing duplicate auth lookups must preserve: rate-limit keying by user, role-based guards, ownership checks (`lib/auth/ownership.ts`). Approach: middleware verifies JWT once, attaches `x-user-id` / `x-user-role` to the forwarded request; route handlers read those instead of re-calling Supabase. Headers are server-injected post-verify so they cannot be spoofed from outside.
- Service worker must **not** cache authenticated API responses across users. Scope cache key by `Authorization` cookie hash or skip caching when the cookie changes (Serwist supports this via plugin).

---

## Audit Scope
- API routes: `app/api/**/route.ts` (33 handlers)
- Auth & middleware: [middleware.ts](../middleware.ts), [lib/auth/*](../lib/auth/)
- DB queries & schema/indexes: [lib/db/queries/*](../lib/db/queries/), [lib/db/schema.ts](../lib/db/schema.ts)
- Cache strategy: [lib/cache/*](../lib/cache/), client fetch behavior
- PWA service worker: [app/sw.ts](../app/sw.ts), [next.config.ts](../next.config.ts)
- User-facing pages with data loading: [app/app/**](../app/app/)

---

## Key Findings (v2)

### 1. Auth work runs 5–6× per dashboard load
Each `supabase.auth.getUser()` is a network call to Supabase Auth. For one dashboard navigation:
1. `middleware.ts` ([:30](../middleware.ts#L30))
2. `app/app/layout.tsx` RSC ([:8](../app/app/layout.tsx#L8))
3. `app/app/dashboard/page.tsx` RSC ([:11](../app/app/dashboard/page.tsx#L11))
4–6. Three parallel API calls each calling `requireSiteAccess` → `getSessionUser`.

**Fix**: middleware uses `getClaims()` (local JWT verify), forwards `x-user-id` / `x-user-role` headers; all downstream code reads those headers. No more network calls; role still cached for 5 min.

### 2. Client fetch strategy forces refetch on revisit
- `cache: 'no-store'` default in [lib/http/client.ts:79](../lib/http/client.ts#L79).
- Pages fetch in `useEffect` on mount ([DashboardPageClient.tsx](../app/app/dashboard/DashboardPageClient.tsx), [sites/page.tsx](../app/app/sites/page.tsx), [sites/[id]/page.tsx](../app/app/sites/[id]/page.tsx)).

**Fix**: RSC-first fetch (dashboard, sites list) + service-worker stale-while-revalidate for client-issued GETs. Drop `no-store` default; opt-in `no-store` per-call where required (writes' read-after-write).

### 3. API fan-out
Dashboard hits `/api/users/me`, `/api/sites`, `/api/notifications` independently.

**Fix**: `/api/dashboard` aggregate (single auth, single DB roundtrip set, parallel internal queries). Keep the underlying endpoints — they are used elsewhere. *Don't delete.*

### 4. Query / index alignment
- `sites(supervisor_id, archived_at)` filter has only a `supervisor_id` index. **Low-volume table — defer unless EXPLAIN ANALYZE shows seq-scan cost.**
- Hot tables (`labour_entries`, `material_entries`, etc.) already have `(site_id, date)` composite — likely fine.

**Fix**: validate with `EXPLAIN ANALYZE` on top 5 endpoints; add indexes only where plans show real cost.

### 5. Realtime: polling instead of push
- Long-poll up to 25 s ([live-feed/route.ts](../app/api/admin/live-feed/route.ts))
- SSE polls DB every 2 s ([live-feed-sse/route.ts](../app/api/admin/live-feed-sse/route.ts))

**Fix**: Supabase Realtime `postgres_changes` channel pushes from WAL — zero polling, sub-second delivery.

### 6. Cache is partial
- Server `getOrSetJson` used on some routes ([lib/cache/getOrSetJson.ts](../lib/cache/getOrSetJson.ts)).
- Redis env-optional, silent bypass ([lib/cache/redis.ts](../lib/cache/redis.ts)) — fine for dev, but make it a *startup* error in production env so we know when we're flying blind.
- No client-side query cache; no service-worker runtime caching.

### 7. Observability minimum
Per-request `requestId` exists, error wrappers exist. Missing systematic API duration + DB duration + cache hit-rate metrics. **Fix in the same `withApi(handler)` wrapper that solves DRY.**

### 8. Bundle / 3rd-party costs (new in v2)
- PostHog `autocapture: true` ([app/providers.tsx:16](../app/providers.tsx#L16)) — captures every click/input. Disable autocapture; instrument key events explicitly.
- No bundle audit on record. Run `next build` + `@next/bundle-analyzer` once; cut the top 3 offenders.

---

## Route Risk Triage

### High-impact (week-1 scope)
1. Dashboard — `app/app/dashboard/*`; APIs: `/api/users/me`, `/api/sites`, `/api/notifications`
2. Sites list — `app/app/sites/page.tsx`; API: `/api/sites`
3. Site detail — `app/app/sites/[id]/page.tsx`; APIs: `/api/sites/[id]`, `/api/sites/[id]/entries`, `/api/sites`

### Medium
- `/api/admin/analytics`, `/api/admin/live-feed`, `/api/admin/live-feed-sse`

### Lower (standardize via `withApi` wrapper)
- Catalog, forms, requests, transfers endpoints.

---

## Action Plan (v2)

### Phase 0 — Baseline & wrappers (0.5–1 day)
Goal: measurable baseline + DRY scaffolding all later phases use.

Tasks:
1. Enable Vercel Speed Insights (`@vercel/speed-insights`) on `app/layout.tsx`. One env var, no custom dashboard.
2. Add `withApi(handler)` helper: requestId, try/catch, error response, **API duration log**.
3. Add Drizzle query timing wrapper (post-execute hook, logs slow queries > 100 ms).
4. Make missing Redis env a **production startup error**; keep silent bypass in dev.
5. Disable PostHog `autocapture`; add explicit captures only where needed.

Deliverable: baseline numbers in Speed Insights for dashboard/sites; `withApi` adopted across 5 routes as proof.

### Phase 1 — Kill auth & fetch waterfalls (3–5 days)
Goal: eliminate the duplicated `getUser()` calls and the client mount waterfall.

Tasks:
1. Switch middleware to `supabase.auth.getClaims()` (local JWT verify). Forward `x-user-id`, `x-user-role` headers.
2. Rewrite `getSessionUser` / `requireAuth` to read forwarded headers (no Supabase call). Keep `userProfiles` role cache as fallback.
3. Collapse `requireAuth/Admin/SiteAccess` into one parameterized guard.
4. Add `/api/dashboard` aggregate endpoint (single auth, parallel internal queries). Keep `/api/users/me`, `/api/sites`, `/api/notifications` intact for other callers.
5. Move dashboard + sites list + site detail to **RSC data fetch**; pass to client component as props. Remove `useEffect` mount fetches.
6. Reconsider `force-dynamic` on dashboard — keep dynamic but rely on RSC streaming + `Suspense`.
7. Replace `cache: 'no-store'` default in `lib/http/client.ts` with explicit per-call policy.
8. Replace "Loading..." text with skeleton components.

Deliverable: dashboard cold load is one auth path, one aggregate fetch, RSC-streamed.

### Phase 2 — PWA service worker for repeat-load speed (2–3 days) *new*
Goal: near-instant return navigation. This is the dominant lever for "mobile feel."

Tasks:
1. Extend `app/sw.ts` runtime caching:
   - Precache app shell (`/app/dashboard`, `/app/sites`, key icons, fonts).
   - `/api/*` GETs → `StaleWhileRevalidate` with 60 s max age; cache key includes user-id header to prevent cross-user bleed.
   - HTML navigations → `NetworkFirst` with 3 s timeout, fallback to cached shell.
2. Add cache versioning + cleanup on user logout (`registration.unregister()` + caches.delete).
3. Wire Supabase auth-state-change → SW message → purge user-scoped caches on sign-out.

Deliverable: return-to-dashboard renders from cache in < 200 ms; revalidates in background.

### Phase 3 — Optimistic UI for writes (2 days) *new*
Goal: forms and approvals feel instant on mobile.

Tasks:
1. `useOptimistic` for: daily-entry submit, mark-notification-read, approve/decline actions.
2. Rollback toast on server error.
3. Server actions where they reduce a round-trip (`'use server'` for write paths that don't need REST shape).

Deliverable: tap → UI updates < 50 ms; failures revert with toast.

### Phase 4 — Query / cache hardening (2–3 days)
Goal: scale safety + durable speed under load.

Tasks:
1. `EXPLAIN ANALYZE` top 5 endpoints under realistic data volume; add indexes only where plans show seq scans.
2. Add pagination defaults to any list endpoint missing them.
3. Project columns on hot list endpoints (`entries`, `notifications`); leave `sites` as-is until volume warrants.
4. Standardize cache invalidation: every write that touches a cached read invokes a known invalidator from `lib/cache/invalidate.ts`. Audit checklist, not new infra.

Deliverable: query-plan notes + migration(s) only where justified.

### Phase 5 — Realtime swap (1–2 days)
Goal: kill polling on admin paths.

Tasks:
1. Replace `live-feed-sse` polling with Supabase Realtime `postgres_changes` channel client-side.
2. Deprecate `live-feed` long-poll endpoint; remove once clients migrated.

Deliverable: admin live-feed updates pushed sub-second; zero polling load.

### Phase 6 — Regression guard (0.5 day)
Goal: don't regress what we just won.

Tasks:
1. Lighthouse CI on PR for `/app/dashboard` and `/app/sites` only. Fail if INP/LCP regress by > 20 %.
2. Bundle size budget in CI (`next build` output diff).

Deliverable: PR-blocking perf gate on two routes.

---

## Total Effort
- v1 estimate: 14–23 days. v2 estimate: **9–14 days** for one experienced full-stack engineer.
- Week-1 visible gains: Phase 0 + Phase 1 + Phase 2 (PWA shell). That alone delivers most of the "mobile feel."

## Expected Outcome
After Phases 1–3:
- **Dashboard cold load**: one auth verify + one aggregate query, RSC-streamed, skeletons up < 100 ms.
- **Dashboard return navigation**: served by service worker, perceptually instant.
- **Write actions** (entry submit, approvals): UI < 50 ms via optimistic updates.
- **Admin live feed**: sub-second push instead of 2 s polls.

## Android Decision Guidance
Defer. After this plan ships, web should feel ≥ 90 % of native for daily-entry workflows (offline-cached shell, optimistic writes, push realtime). Revisit native only if business needs (offline-first sync, deep device integration, store distribution) emerge — not for perceived performance.

---

## Proposed Execution Order (first 7 working days)
1. Day 0.5 — Phase 0: Speed Insights, `withApi`, query timing, PostHog autocapture off.
2. Days 1–3 — Phase 1: `getClaims` migration, `/api/dashboard`, RSC fetch.
3. Days 4–5 — Phase 2: service-worker app-shell + SWR for `/api/*` GETs.
4. Day 6 — Phase 3: optimistic UI on top 3 write paths.
5. Day 7 — measure, compare to Day-0 baseline, plan next tranche.

## Review Checklist (decisions needed before start)
1. Confirm target user journeys: Dashboard, Sites, Site Detail, daily entry submit. **(default yes)**
2. Confirm freshness windows: `/api/sites` SWR 60 s OK? `/api/notifications` 30 s OK?
3. Confirm we swap admin live-feed from poll → Supabase Realtime (vs keeping SSE).
4. Approve `getClaims` migration (requires Supabase project on asymmetric JWT — check project settings).
5. Approve `withApi` wrapper rollout style: incremental (5 routes proof) vs all-33 in one PR.
