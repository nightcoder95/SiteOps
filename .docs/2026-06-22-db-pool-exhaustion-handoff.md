# Handoff: Admin Catalog "Loading…" freeze — DB connection-pool exhaustion

**Date:** 2026-06-22
**Status:** Root cause identified & proven. Mitigation partly applied (uncommitted) but the key guard (`statement_timeout`) is **ineffective through the Supabase pooler**. Needs a planned, durable fix.

---

## Symptom

`/app/admin/catalog` is stuck on "Loading catalog…" forever. Network shows the page GET 200, but the data fetch to `/api/admin/catalog` never resolves. `/api/dashboard` shows the same. Light endpoints (`/api/forms/categories`, `/api/sites`, `/api/notifications`, `/api/catalog/units`) work.

Why the UI hangs (not "Failed to load"): `useApiResult` → `resultFetcher` (`lib/http/useApiQuery.ts:39-48`) **never throws** — it always resolves to a `ClientResult`. So SWR only stays in `isLoading` if the underlying `fetch` itself never settles. `CatalogManager` gates on `isLoading` (`components/catalog/CatalogManager.tsx:137`). Therefore: a perpetual "Loading…" means the HTTP request truly never completes — server-side hang, not an error path.

---

## Root cause (proven)

**Database connection-pool exhaustion via orphaned queries.**

Chain:
1. **Fan-out per request.** `GET /api/admin/catalog` (`app/api/admin/catalog/route.ts:17-44`) fires ~9 queries in parallel (`Promise.all`: categories + subcategories + 7 `USAGE_SOURCES` group-by counts from `lib/catalog/usageSources.ts`). `/api/dashboard` and `/api/notifications` (`Promise.all` of list+count) also fan out.
2. **Small pool.** `lib/db/client.ts` had `max: 5`. One catalog load already wants more connections than exist → contention.
3. **Aborted requests orphan in-flight queries.** When the browser reloads the slow page (or SWR/curl times out), Next fires `request.signal` abort, but the in-flight postgres.js query is **not cancelled**. The server connection stays pinned. In `pg_stat_activity` these show as `state=active, wait_event=ClientRead`, application_name `Supavisor`, ages 60–210s.
4. **No effective statement timeout.** Nothing reaps the orphan, so each leak permanently consumes a pool slot. A handful of aborts → all slots gone → every subsequent query waits for a slot that never frees → **infinite hang** → more user refreshes → more orphans → death spiral.
5. **Aggravator (uncommitted change):** `idle_timeout` had been raised `60 → 300` in the working tree, holding connections (and pooler slots) 5× longer, widening the leak window.

### Evidence captured this session
- Each catalog query run **directly** on a fresh connection: 50–400ms. **Queries are not slow.** The wait is pure pool starvation.
- `pg_stat_activity`: repeatedly found **~5 connections wedged** `active/ClientRead` on plain `notifications` count/list and `sites` selects. **No blocking locks** (ruled out lock contention).
- Killing the wedged backends → catalog answered in **0.4s**. Confirms: clear the leak → instant.
- Dev-server log signature of a leak: a `notifications` request logs `notifications.list` done but **no `notifications.count`** and **no `api_request` completion** — one of the two parallel queries got a connection, the sibling waited on an exhausted pool forever.
- App connects as role **`postgres`** (Supabase superuser) through the **transaction pooler (Supavisor)** at `…pooler.supabase.com:6543`. `application_name: "siteops-next"` set in code does **not** appear in `pg_stat_activity` — the pooler masks it as `Supavisor`.

---

## Why the attempted fix did NOT work

Applied (uncommitted) in `lib/db/client.ts`:
- `max: 5 → 15` (reasonable; reduces contention but only **delays** exhaustion)
- `idle_timeout: 300 → 120` (good; undoes the aggravator)
- `connection: { statement_timeout: 15_000 }` — **INEFFECTIVE.**

**Proven:** connecting through the pooler with `connection.statement_timeout` (or `connection.options: "-c statement_timeout=..."`) still reports `SHOW statement_timeout` = **`2min`** (the pooler's own default). **Supavisor strips client startup parameters.** So the app-side guard is dead. Catalog still ran 45–65s in logs after this change — `max:15` just postponed the freeze.

`SELECT current_user, current_setting('statement_timeout')` through the pooler → `postgres`, `2min`.

---

## Options for the durable fix (to plan)

1. **Server-side `statement_timeout` on the role** — the only knob that survives the pooler.
   - `ALTER ROLE postgres SET statement_timeout = '30s'` (or 60s). Reaps orphans → pool self-heals. Trivially reverted: `ALTER ROLE postgres RESET statement_timeout`.
   - **Risk:** global for all app queries as `postgres`, incl. the **Analytics** page — a legitimately >30s query would be aborted. Migrations use `DIRECT_URL` (role `postgres` too, different host) — long migrations could be cut; override per-migration if needed.
   - **Open question:** app runs as superuser `postgres`. Prefer a least-privilege app role with its own `statement_timeout` (Supabase pattern). Bigger change.
2. **Cancel queries on request abort (true cure).** Tie `request.signal` → postgres.js query `.cancel()` so orphans never form. Invasive: drizzle-orm/postgres-js doesn't surface this cleanly across ~all routes. Needs a wrapper.
3. **Reduce fan-out.** Make `/api/admin/catalog` not fire 9 queries at once (e.g. one combined query / sequential / `Promise.allSettled` with bounded concurrency). Lowers peak connection demand.
4. **Pool sizing / pooler mode.** Confirm Supabase pooler max for this project; consider session pooler (5432) vs transaction pooler trade-offs for a long-lived Node server.
5. **Verify the abort source.** Check whether SWR/`requestJson` config retries or times out the catalog fetch in a way that amplifies aborts; whether the live-feed SSE (`app/api/admin/live-feed-sse/route.ts` — `setInterval` query every 2s for the stream's life) contributes under HMR/multiple tabs.

**Recommended combo to evaluate:** (1) role-level `statement_timeout` as the safety net + (3) cut catalog fan-out + keep `max` bump. (2) is the "correct" cure but highest effort.

---

## Key files / lines
- `lib/db/client.ts` — pool config (has uncommitted, partly-ineffective edits). **Decide: keep `max:15`+`idle_timeout:120`, drop the dead `statement_timeout` line.**
- `app/api/admin/catalog/route.ts:17-44` — 9-query fan-out.
- `lib/catalog/usageSources.ts` — the 7 group-by usage queries.
- `app/api/notifications/route.ts:31-39` — parallel list+count (clear leak signature in logs).
- `lib/http/useApiQuery.ts:39-48` — `resultFetcher` never throws → why hang shows as infinite "Loading".
- `components/catalog/CatalogManager.tsx:18,137` — `useApiResult` + `isLoading` gate.
- `app/api/admin/live-feed-sse/route.ts` — long-lived stream, 2s polling; check as a secondary connection consumer.

## Environment / repro notes
- Web app: `SiteOps-Web/`. Dev: `npm run dev` (Next 16, Turbopack, `-H 127.0.0.1 -p 3000`). Log was at `/tmp/siteops-dev.log`.
- DB (pooler) URL is `DATABASE_URL` in `.env.local` (Supabase transaction pooler :6543, role `postgres`). `DIRECT_URL` host did **not** resolve from this machine. `.env` also has a stray Neon `DATABASE_URL` — `.env.local` wins.
- Reproduce the freeze: fire ~12+ concurrent `/api/admin/catalog` requests each aborted at ~1s, then watch the pool wedge. Inspect with `pg_stat_activity` filtering `application_name='Supavisor' AND state='active' AND wait_event='ClientRead'`.
- Auth for direct API testing: Supabase password grant against `…supabase.co/auth/v1/token?grant_type=password` with the publishable key, then `Authorization: Bearer <access_token>` (the proxy/middleware `proxy.ts:60-66` accepts Bearer for native clients).

## Current state at handoff
- `lib/db/client.ts` has **uncommitted** edits (`max:15`, `idle_timeout:120`, dead `statement_timeout:15000`). Not committed.
- Dev server was restarted by me during diagnosis; pool currently healthy-ish but **will re-wedge under abort load** until the durable fix lands.
- No DB-level (`ALTER ROLE`) change was made — awaiting plan.
