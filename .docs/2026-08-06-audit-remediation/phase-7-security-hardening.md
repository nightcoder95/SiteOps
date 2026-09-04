# Phase 7 — Security hardening

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the five medium/low hardening gaps from the audit's security appendix without weakening anything that already works.

**Architecture:** Five independent changes, ordered by risk-of-doing-harm rather than by severity. S5 (HSTS) and S3 (fail-open alarm) are additive and safe. S4 (global bucket) is additive with a tunable. S2 (role fail-closed) changes who can authenticate and needs observation before enforcement. S1 (CSP enforcing) is last because it can white-screen the app and break the service worker.

**Tech stack:** Next 16 headers config, `@upstash/ratelimit` 2, Supabase JWT claims, Serwist service worker.

**Covers audit findings:** S1, S2, S3, S4, S5.

**Ordering constraint:** S3 and S4 touch `lib/rateLimit/`, which [Phase 5](phase-5-performance-and-legibility.md)'s F14 also touches. Land F14 first, or do all three together.

---

## What must not regress

The audit found **no critical or high** issues, and the reason is a set of deliberate controls. Every task below must leave all of these intact:

- **`proxy.ts` strips inbound `x-siteops-*` identity headers before every exit path** — including the public-prefix and OPTIONS early returns — and re-sets them only from locally verified JWT claims. This is what makes header-based auth safe. Any middleware edit must preserve strip-before-exit.
- **59 of 61 route files call an auth guard.** The exceptions are the deliberate always-410 `auth/create-profile` stub and the catalog GET (which calls `requireCapability` inline).
- **`sql.raw` is used in exactly two places**, both interpolating identifiers from the app's own schema metadata (`lib/catalog/overviewQuery.ts`) or a numeric constant (`lib/db/queries/search.ts`). No user input reaches an identifier position.
- **Mass assignment is blocked by explicit field destructuring**, in routes (named fields from `validation.data`) and in `updateEntryById`.
- **CSV formula injection is neutralised** (`lib/export/serialize.ts:41-56`) with a numeric-aware prefixer, unit-tested.
- **`handleDbError` never leaks internals**; `lib/ui/toast.ts` independently refuses to render raw backend strings.
- **Rate limiting is keyed by userId first**, IP second.

---

## Global constraints

Read [README.md § Global constraints](README.md#global-constraints-apply-to-every-phase-every-task). Phase-specific:

- **Two of these changes can lock users out** (S2) or **white-screen the app** (S1). Both get a staged rollout with an observation window. Do not compress that.
- Run tests as `npm run test -- --testTimeout=30000`.
- `tests/proxy.test.ts` is the guard for anything touching middleware.

---

## Pre-flight

- [x] **P0.1** Phase 5's F14 merged (or you are doing it here).
- [x] **P0.2** Clean tree, green baseline, recorded pass count.
- [x] **P0.3** Run the dependency audit that already exists: `npm run audit:ci`. Record the result. If it fails, fix or triage **before** starting — a known-vulnerable dependency outranks everything below.
- [ ] **P0.4** `git checkout -b phase-7-security-hardening`.

---

## S5 (low) — Add HSTS

**Files:**
- Modify: `next.config.ts`

**Verified:** `securityHeaders` sets `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and the report-only CSP — **no `Strict-Transport-Security`**. Vercel adds HSTS on `*.vercel.app`, but a custom domain needs it explicitly or a first visit over `http://` can be downgraded.

**Safest change in this phase.** Do it first.

### Task 1 — Add the header

- [x] **Step 1: Confirm every subdomain is HTTPS-only before choosing `includeSubDomains`.** List the domains this app serves on. If any subdomain serves plain HTTP (a legacy tool, a status page), `includeSubDomains` will break it.

  | Domain / subdomain | HTTPS only? |
  |---|---|
  | | |

- [x] **Step 2: Add the header**

```ts
  // Downgrade protection. Vercel sets this on *.vercel.app automatically, but
  // custom domains need it explicitly. Two years, per the usual guidance.
  // `preload` is deliberately omitted — submitting to the preload list is
  // effectively irreversible and requires every subdomain to be HTTPS-only.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
```

Drop `includeSubDomains` if Step 1 found any HTTP subdomain.

- [x] **Step 3: Verify**
```bash
npm run build && npm run start &
curl -sI http://localhost:3000/ | grep -i strict-transport
```
Then check the deployed preview with `curl -sI https://<preview-url>/`.

- [x] **Step 4: Do NOT add `preload`.** It is a one-way door: removal from the browser preload list takes months. Revisit only after HSTS has been live and clean for a while and every subdomain is confirmed.

- [ ] **Step 5: Commit**
```bash
git add next.config.ts
git commit -m "security: add Strict-Transport-Security header"
```

---

## S3 (low) — Rate limiting fails open silently

**Files:**
- Modify: `lib/rateLimit/upstash.ts` or a startup module
- Modify: `lib/rateLimit/guard.ts` (comment only)

**Verified:** `guard.ts:16-17` returns `null` — no limiting — when `NODE_ENV !== "production"` **or** when `upstashRateLimit` is null. So a missing `UPSTASH_REDIS_REST_URL` in production **silently disables all rate limiting**, with nothing in the logs.

The unauthenticated key uses the first `x-forwarded-for` entry. On Vercel that header is platform-set and trustworthy; behind a self-hosted proxy that *appends* rather than overwrites, it is client-spoofable.

**Do not change the fail-open behaviour itself.** Failing closed would take the entire API down on a Redis outage — a self-inflicted denial of service far worse than the abuse the limiter prevents. The fix is to make the failure **loud**.

### Task 2 — Alarm on a disabled limiter

- [x] **Step 1: Warn once at module load, in production only**

In `lib/rateLimit/upstash.ts`, after the construction:

```ts
if (!upstashRateLimit && process.env.NODE_ENV === "production") {
  // Fail-open is deliberate — a Redis outage must not take the API down — but
  // it must never be silent. A missing env var in production disables rate
  // limiting entirely, and without this line nothing would say so.
  console.error(
    "[rate-limit] DISABLED in production: UPSTASH_REDIS_REST_URL / _TOKEN are not set. " +
      "All endpoints are unthrottled.",
  );
}
```

Use the repo's structured logger if there is a module-scope-safe one (`lib/logging/log.ts` — check whether its functions require a `requestId`; if they do, `console.error` at module scope is correct and honest).

- [x] **Step 2: Surface it in the health check, if one exists**
```bash
find app/api -name "route.ts" | xargs grep -ln "health\|status" | head
```
If a health endpoint exists, add a `rateLimitEnabled: boolean` field to its response so monitoring can alert on it. If none exists, **do not create one** — that is new public surface and needs its own design.

- [x] **Step 3: Document the XFF trust assumption** next to the parse in `guard.ts`:

```ts
  // x-forwarded-for is platform-set on Vercel (the platform overwrites it), so
  // the first entry is trustworthy there. If this app is ever self-hosted
  // behind a proxy that APPENDS instead, a client can spoof this value and
  // evade the unauthenticated bucket — revisit the key derivation then.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
```

- [x] **Step 4: Verify** — start the app with `NODE_ENV=production` and no Upstash env; the error line appears exactly once. With the env set, it does not appear.

- [ ] **Step 5: Commit**
```bash
git add lib/rateLimit/
git commit -m "security: alarm loudly when rate limiting is disabled in production"
```

---

## S4 (low) — Per-path keys allow cross-endpoint spraying

**Files:**
- Modify: `lib/rateLimit/upstash.ts`
- Modify: `lib/rateLimit/guard.ts`
- Modify: `lib/rateLimit/guard.test.ts` (create if absent)

**Verified:** the key is `user:${userId}:${pathname}` (`guard.ts:23`), so the 60/min limit applies **per endpoint**. With ~61 routes, one identity's effective budget is ~3660 requests/minute. Fine for the current threat model; not fine for a leaked token.

**Fix:** add a second, much looser **global** bucket alongside the per-path one. Both must pass.

### Task 3 — Add a global per-user bucket

- [x] **Step 1: Choose the limit from real traffic, not intuition.** Load one heavy screen (the all-operations view, or the admin catalog) and count the API requests it makes. Multiply by a realistic burst (a user tapping through 5 screens in a minute), then multiply by 3 for headroom.

  | Measurement | Value |
  |---|---|
  | requests for the heaviest single page load | |
  | × 5 screens/min | |
  | × 3 headroom → **proposed global limit** | |

  Set it too tight and you break a legitimate power user; the per-path limiter is already the primary control, so err generous.

- [x] **Step 2: Add a second limiter**

```ts
// Second, much looser bucket keyed by identity alone. The per-path limiter is
// the primary control; this one exists so a leaked token cannot multiply its
// budget by the number of endpoints (~61) by spraying across them.
export const upstashGlobalRateLimit =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(/* Step 1 value */, "1 m"),
        analytics: true,
        ephemeralCache,   // share the Map from Phase 5's F14
      })
    : null;
```

- [x] **Step 3: Check both in `applyRateLimit`**

```ts
  // Both buckets must pass. Evaluated in parallel — two Upstash calls cost the
  // same wall time as one, and the ephemeral cache short-circuits most of them.
  const [perPath, global] = await Promise.all([
    upstashRateLimit.limit(key),
    upstashGlobalRateLimit ? upstashGlobalRateLimit.limit(identityKey) : null,
  ]);
  if (perPath.success && (global === null || global.success)) return null;

  const failed = perPath.success ? global! : perPath;
  return errorResponse(
    ERROR_CODES.RATE_LIMITED,
    "Too many requests",
    429,
    { limit: failed.limit, remaining: failed.remaining, reset: failed.reset },
    requestId,
  );
```

`identityKey` is `user:${userId}` or `ip:${ip}` — the same derivation minus the pathname.

**Do not change the error code, status, or the `details` shape.** Clients and tests read them.

- [x] **Step 4: Write the tests**

Create/extend `lib/rateLimit/guard.test.ts`:

```ts
// 1. both buckets pass → returns null.
// 2. per-path bucket fails → 429 with the per-path bucket's limit/remaining/reset.
// 3. global bucket fails, per-path passes → 429 with the GLOBAL bucket's numbers.
// 4. global limiter unconfigured (null) → falls back to per-path only, no throw.
// 5. non-production → returns null before touching either limiter.
// 6. the identity key omits the pathname; the per-path key includes it.
// 7. an unauthenticated request keys both buckets on the IP.
```

- [ ] **Step 5: Verify empirically.** Hit **many different** endpoints as one user, more than the global limit in total but under 60 on each → 429 appears. Before this change it would not have.

- [ ] **Step 6: Commit**
```bash
git add lib/rateLimit/
git commit -m "security: add a global per-identity rate-limit bucket alongside the per-path one"
```

---

## S2 (low-medium) — Missing role claim fails open to Supervisor

**Files:**
- Modify: `lib/auth/session.ts`
- Modify: `lib/auth/session.test.ts`

### Verified state, including the part the audit did not check

`lib/auth/session.ts:32`:
```ts
const role = parseSessionRole(headers.get(AUTH_USER_ROLE_HEADER)) ?? ROLES.SUPERVISOR;
```

And `proxy.ts:89-93` **deletes** the role header when the claim is missing or unparseable:
```ts
if (userRole) requestHeaders.set(AUTH_USER_ROLE_HEADER, userRole);
else requestHeaders.delete(AUTH_USER_ROLE_HEADER);
```

So the two combine into exactly the fail-open the audit describes: a verified JWT with no `user_role` claim (hook misconfigured, hook removed, token minted before the hook was deployed) yields a Supervisor session.

**And `lib/auth/session.test.ts` explicitly pins this** — `'defaults to Supervisor when role header is absent'` (`:24`) and `'defaults to Supervisor when role header is an unknown value'` (`:37`). The audit said this "may" be pinned; it is.

### The risk of the fix, stated plainly

Failing closed means every affected user is **logged out**, not merely downgraded. If the `custom_access_token` hook is misconfigured for even a subset of users, this change locks them out of the app with no self-service recovery. That is why this task is **observe first, enforce second** — and why it is not a one-commit change.

### Task 4 — Instrument before changing anything

- [x] **Step 1: Log every occurrence, keep the current behaviour**

```ts
const parsedRole = parseSessionRole(headers.get(AUTH_USER_ROLE_HEADER));
if (!parsedRole) {
  // A verified JWT with no usable user_role claim means the
  // custom_access_token hook did not run or was misconfigured. Today this
  // silently grants Supervisor (fail open). Logged so we can measure the
  // real-world rate BEFORE failing closed — see phase 7, S2.
  logWarn(requestId, "auth_role_claim_missing", { userId });
}
const role = parsedRole ?? ROLES.SUPERVISOR;
```

`getSessionUserFromHeaders` is a pure header reader with no `requestId` in scope. **Do not thread a requestId through it just for this** — check whether `lib/logging/log.ts` has a requestId-less variant; if not, use `console.warn` with a stable prefix that log search can match. Pick one and be consistent.

- [ ] **Step 2: Deploy and observe for at least one full JWT lifetime**, ideally a week. Record:

  | Metric | Value |
  |---|---|
  | occurrences of `auth_role_claim_missing` | |
  | distinct userIds affected | |
  | observation window | |

- [ ] **Step 3: Decide**
  - **Zero occurrences** → proceed to Task 5.
  - **Any occurrences** → **do not fail closed yet.** Fix the hook for those users first, confirm the count returns to zero, then proceed. Failing closed with a known-broken hook is an outage you chose.

- [ ] **Step 4: Commit the instrumentation alone**
```bash
git add lib/auth/session.ts
git commit -m "observability: log JWT sessions missing the user_role claim"
```

### Task 5 — Fail closed (only after Task 4 shows zero)

- [ ] **Step 1: Change the default**

```ts
export function getSessionUserFromHeaders(headers: Headers): SessionUser | null {
  const userId = headers.get(AUTH_USER_ID_HEADER);
  if (!userId) return null;

  const role = parseSessionRole(headers.get(AUTH_USER_ROLE_HEADER));
  if (!role) {
    // Fail closed. A verified JWT without a usable role means the
    // custom_access_token hook did not run; granting the lower of the two
    // roles is still granting real capabilities (create entries, read sites).
    // Treated as unauthenticated instead. Occurrences are logged above and
    // were confirmed at zero before this was enabled.
    logWarn(...);   // keep the Task 4 logging
    return null;
  }

  const email = headers.get(AUTH_USER_EMAIL_HEADER) ?? "";
  return { id: userId, email, role };
}
```

- [ ] **Step 2: Update the two pinning tests**

`lib/auth/session.test.ts:24` and `:37` currently assert the Supervisor default. Rewrite them to assert the new behaviour, and **keep the old expectation visible in the test name's history** via the commit message — this is a deliberate behaviour change, not a fixed bug:

```ts
it('returns null when the role header is absent (fail closed)', () => {
  expect(getSessionUserFromHeaders(headersWithout('role'))).toBeNull();
});

it('returns null when the role header is an unknown value (fail closed)', () => {
  expect(getSessionUserFromHeaders(headersWithRole('Wizard'))).toBeNull();
});
```

- [ ] **Step 3: Trace the blast radius before deploying**
```bash
grep -rn "getSessionUserFromHeaders\|safeGetSessionFromHeaders\|getSessionFromRequest" app lib components
```
For each caller, confirm a `null` session produces the correct outcome (401 from a route guard, redirect from a page) and not a crash. Write the list here:

  | Caller | Behaviour on null | OK? |
  |---|---|---|
  | | | ☐ |

- [ ] **Step 4: Verify**
```bash
npm run lint && npm run test -- --testTimeout=30000
npm run test:e2e
```
Plus manual: a normal sign-in still works end to end (the common path must be untouched).

- [ ] **Step 5: Have a rollback ready.** This is a one-line revert. Know how to ship it fast, and watch auth error rates for the first hour after deploy.

- [ ] **Step 6: Commit**
```bash
git add lib/auth/session.ts lib/auth/session.test.ts
git commit -m "security: treat a missing JWT role claim as unauthenticated instead of Supervisor"
```

---

## S1 (medium) — Promote the CSP to enforcing

**Files:**
- Modify: `next.config.ts`
- Possibly: `app/layout.tsx`, `app/sw.ts`

**Verified:** `next.config.ts:9-19,32` ships `Content-Security-Policy-Report-Only` with `script-src 'self' 'unsafe-inline' 'unsafe-eval'`. Report-only provides **zero** XSS mitigation, and even enforcing, `unsafe-inline` + `unsafe-eval` neuters `script-src` against injected scripts.

**This is the highest-risk task in the phase.** A wrong CSP white-screens the app or silently kills the service worker — and a broken SW in an installed PWA is hard to recover from on a user's device.

**Do it in four separate deploys.** Not one.

### Task 6 — Collect and read the reports

- [x] **Step 1: Confirm reports are actually going somewhere.** The policy has no `report-uri` / `report-to` directive, so violations are only visible in each browser's console. **Add a reporting endpoint or accept that you are flying blind.**

  Options: a `report-to` group pointing at a collector, or a minimal `POST /api/csp-report` route. If you add a route: it takes **unauthenticated** input from the public internet, so it must be rate-limited, must not log unbounded bodies, and must never echo input back. Treat it as its own small design task.

- [ ] **Step 2: Collect for a full week of real usage**, covering: the installed PWA, a desktop browser, the service worker updating, PostHog loading, Speed Insights, and the Google Fonts link (which [Phase 6](phase-6-dead-code-and-polish.md) may have removed).

- [ ] **Step 3: Catalogue every violation**

  | Directive | Blocked source | Cause | Fix |
  |---|---|---|---|
  | | | | |

---

### Task 7 — Drop `unsafe-eval`

`unsafe-eval` is usually only needed by dev tooling. The three candidates in this stack: Serwist/Workbox, PostHog, and Next's dev overlay (dev only, so irrelevant to the production header).

- [x] **Step 1: Remove `'unsafe-eval'` from the report-only policy** and deploy.
- [ ] **Step 2: Exercise everything** — install the PWA, let the SW update, navigate offline, trigger PostHog events. Watch for new report-only violations naming `eval`.
- [ ] **Step 3:** If violations appear, identify the library and check for a build flag that avoids `eval` before adding the directive back. Record the finding either way.
- [ ] **Step 4: Commit**
```bash
git commit -m "security: drop unsafe-eval from the CSP (still report-only)"
```

---

### Task 8 — Replace `unsafe-inline` with nonces

- [x] **Step 1: Inventory every inline script**
```bash
grep -rn "<script\|dangerouslySetInnerHTML" app --include="*.tsx"
```
Include what Next injects itself (hydration data, the router payload) and what PostHog's snippet does.

- [x] **Step 2: Understand the constraint before writing code.** Nonce-based CSP in the Next App Router requires generating a per-request nonce in middleware and threading it into the header **and** into every inline script tag. Next has documented support for this; **read the docs for Next 16 specifically** rather than adapting a Pages Router example. If static generation is in play for any route, a nonce cannot be embedded at build time — those routes need a hash-based allowlist instead.

- [x] **Step 3: This task may legitimately conclude "not worth it yet."** If the app has no inline scripts of its own and the only `unsafe-inline` need comes from Next's own hydration payload, the honest outcome may be to enforce the CSP **with** `unsafe-inline` for `script-src` and take the win on the other directives (`default-src`, `frame-ancestors`, `base-uri`, `form-action`, `object-src`). That is still meaningfully better than report-only. **Write down the decision and the reasoning** — a documented "we chose not to" is a fine result; an undocumented one is technical debt.

- [x] **Step 4:** Whichever path, add `object-src 'none'` — it is free and blocks a whole class of legacy plugin injection. It is currently absent.

---

### Task 9 — Flip to enforcing

- [ ] **Step 1: Only proceed when a full week of report-only produces zero unexpected violations.**

- [ ] **Step 2: Rename the header** from `Content-Security-Policy-Report-Only` to `Content-Security-Policy`, keeping the reporting directive so violations stay visible.

- [ ] **Step 3: Test the installed PWA explicitly, on a real device.** Service-worker script loading is the classic CSP casualty, and a broken SW on an installed app is the worst failure mode here. Check: fresh install, SW registration, SW update, offline navigation to `app/~offline`, push notification receipt.

- [ ] **Step 4: Test every third party** — Supabase (including the `wss://` realtime connection the `connect-src` allows), PostHog, Upstash, Vercel Speed Insights.

- [ ] **Step 5: Ship behind a fast rollback.** Know the revert commit before you deploy. Watch error rates and CSP reports for the first hour.

- [ ] **Step 6: Commit**
```bash
git add next.config.ts
git commit -m "security: promote the CSP from report-only to enforcing"
```

---

## Phase regression checklist

### Automated

- [x] `npm run lint` → exit 0.
- [x] `npm run test -- --testTimeout=30000` → green.
- [ ] `npm run test:e2e` → green. **This is the main guard for S1 and S2.**
- [x] `tests/proxy.test.ts` green — nothing in this phase should touch middleware, but confirm.
- [x] `npm run audit:ci` → clean, or triaged with a written reason.
- [x] `npm run build && npm run start`, then `curl -sI http://localhost:3000/` shows: `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and the CSP header (report-only or enforcing, per progress).

### The invariants — re-verify each

- [x] **Header stripping intact.** `git diff main -- proxy.ts` → empty. If not empty, re-read the strip-before-exit invariant and confirm every early return still strips.
- [ ] **Guard coverage unchanged.** `grep -rln 'in auth\|withAuthedApi' app/api | wc -l` → 59; `find app/api -name route.ts | wc -l` → 61.
- [x] **No new `sql.raw`.** `grep -rn "sql.raw" lib app | wc -l` → unchanged from baseline.
- [x] **CSV neutraliser untouched.** `git diff main -- lib/export/serialize.ts` → empty; `lib/export/serialize.test.ts` green.
- [x] **Error hygiene untouched.** `git diff main -- lib/errors/ lib/ui/toast.ts` → empty.
- [x] **Rate-limit key derivation still userId-first.** Reading `guard.ts`, the per-path key is `user:${userId}:${pathname}` with the IP fallback second.

### Behavioural — the two risky changes

- [ ] **S2:** a normal sign-in works; an Admin still sees admin screens; a Supervisor still sees supervisor screens; a token without the role claim is rejected cleanly (a login redirect, not a 500). Test the last one by constructing a token without `user_role` against a scratch environment — **not** production.
- [ ] **S1:** with the CSP enforcing, the app loads; the SW registers and updates; offline navigation works; PostHog fires; Supabase realtime connects; no console CSP errors on any main screen.

### Non-regression on the perf work

- [ ] The global rate-limit bucket did not undo Phase 5's F14 win: it shares the same `ephemeralCache`, and the two `.limit()` calls run in `Promise.all`. Re-run the F14 latency measurement and confirm it has not degraded materially. Record: ______ ms p50 (was ______).

---

## Not addressed here, from the audit's B.2

These are recorded, not done:

- **Supabase RLS posture.** The app connects with its own pooled role, so RLS is presumably bypassed by design and the app layer is the sole enforcement point. The audit asks for a **one-time confirmation that the anon key cannot reach tables directly**. That is a Supabase-console task, not a code change — do it and record the result here:

  | Check | Result | Date |
  |---|---|---|
  | anon key cannot select from `labour_entries` | | |
  | anon key cannot select from `sites` | | |
  | anon key cannot select from `profiles` / users table | | |

- **Per-route zod coverage of every query param across all 61 routes.** Not exhaustively checked by the audit either. Worth a systematic pass; needs its own task.
- **S6 (informational).** Search wildcards (`%`/`_` reach `ILIKE` unescaped — the user only widens their own query, and the statement timeout bounds cost) and the commented-out signup implementation in the 410 stub. **No action.** If a dead-code pass ever reaches `create-profile/route.ts`, that comment documents why the file stays.

---

## Execution record (2026-09-04)

Baseline before Phase 7: 719 passing / 12 skipped (105 files) — the Phase 6 end state, re-verified
green before anything was touched. After: **759 passing / 12 skipped (108 files)**. Every one of the
40 new tests was written failing first and watched fail for the right reason. `npm run lint` exit 0,
`npm run build` compiles, headers confirmed on a running production server with `curl`.

Pass-count reconciliation: 719 + 14 (`lib/security/headers.test.ts`) + 3 (S3 alarm) + 8
(`lib/rateLimit/guard.test.ts`, new file) + 5 (S2 instrumentation) + 8 (`app/api/csp-report`) + 2
(proxy public-prefix) = 759. No test was deleted or weakened.

### Pre-flight

- **P0.1** — Phase 5's F14 is in the tree: `lib/rateLimit/upstash.ts` already pins the shared
  `ephemeralCache`, with the note that under `slidingWindow` it only short-circuits
  already-blocked identifiers. S4 reuses that same Map rather than adding a second one.
- **P0.3 failed as written and was fixed, not waived.** `npm run audit:ci` reported 10
  vulnerabilities (7 high) in production dependencies. `npm audit fix` (non-breaking) cleared all
  but one: `next` 16.2.9 → **16.3.4**, plus transitive bumps to `postcss` 8.5.28, `sharp` 0.35.4,
  `nanoid` 3.3.18, `dompurify` 3.4.14, `brace-expansion` and `fflate`. The Next bump is a real minor
  upgrade, so lint, the full suite and a production build were all re-run against it before any
  Phase 7 code was written — all green.

  **Triaged, deliberately not fixed:** `browserslist` (2 high, transitive via `@serwist/next`). The
  only available fix is `npm audit fix --force`, which changes `@serwist/next` majors. Both
  advisories are memory-exhaustion DoS in a **build-time** dependency — browserslist does not run in
  the request path — while the service worker it would churn is the PWA's core, e2e is already red
  for an unrelated reason, and no visual verification is available in this pass. Fixing it is worth
  its own task with a device check. `npm run audit:ci` therefore still exits non-zero on exactly
  these two.

- **P0.4** — no branch, no commits: this session was scoped to implementation only.

### S5 — HSTS (task 1)

`Strict-Transport-Security: max-age=63072000; includeSubDomains`, no `preload`. Confirmed with the
user that every subdomain is HTTPS-only before `includeSubDomains` was included.

**Structural change the plan did not anticipate:** the header set was extracted from
`next.config.ts` into **`lib/security/headers.ts`** first. It had to be — `next.config.ts` imports
`@serwist/next`, which will not load in the node test environment, so as long as the headers lived
there they could not be unit-tested at all, and TDD was impossible. `next.config.ts` now calls
`buildSecurityHeaders()` and holds no policy of its own. Verified live:

```
Strict-Transport-Security: max-age=63072000; includeSubDomains
```

### S3 — fail-open alarm (task 2)

`lib/rateLimit/upstash.ts` now logs a single loud line at module load when the limiter is
unconfigured **in production only**. Three tests fence it: it fires when unconfigured in production,
stays silent when configured, and stays silent in development where being unlimited is expected.

`console.error` rather than `lib/logging/log.ts` — every logger there requires a `requestId` and
there is no request at module scope, exactly the case the plan says to resolve this way. The
fail-open behaviour itself is unchanged, as instructed.

**Step 2 (health check): no health endpoint exists.** The plan's grep matches ten route files on the
word "status", none of which is a health route, and `/api/health` is a `PUBLIC_ROUTE_PREFIXES` entry
with no handler behind it. Per the plan's own instruction, **none was created**.

Step 3's XFF trust note is in `guard.ts` next to the parse.

### S4 — global per-identity bucket (task 3)

**Step 1, measured rather than guessed.** The pages are server components, so a load makes far fewer
client API calls than the plan assumes: the all-operations view issues 3 distinct endpoints, and the
heaviest client screen (the admin catalog) under 20.

| Measurement | Value |
|---|---|
| requests for the heaviest single page load | ~20 (admin catalog) |
| × 5 screens/min | ~100 |
| × 3 headroom → **proposed global limit** | ~300 → **600 chosen** |

600 was chosen over the computed 300 because the plan says err generous and the per-path limiter
remains the primary control. It is 10× the per-path limit and still cuts the cross-endpoint spray
budget from ~3660/min to 600/min — a ~6× reduction. Tunable without a deploy via
**`RATE_LIMIT_GLOBAL_PER_MINUTE`**.

`upstashGlobalRateLimit` shares the existing `ephemeralCache` Map, and `applyRateLimit` evaluates
both buckets in one `Promise.all`, so Phase 5's F14 posture is unchanged — one round-trip's wall
time, not two. The error code, status and `details` shape are untouched; when the global bucket is
the one that fails, `details` carries the **global** bucket's numbers, which is what the new test
pins.

`lib/rateLimit/guard.test.ts` did not exist and was created: 8 tests covering all seven cases the
plan lists. The key-derivation cases are the important ones — a global key that silently kept the
pathname would look correct and defeat the entire fix.

**Step 5 (empirical multi-endpoint 429) not done:** it needs a real Upstash instance and a
production `NODE_ENV`. Outstanding.

### S2 — role claim (task 4 only, by explicit decision)

Instrumentation only, exactly as the plan sequences it. `getSessionUserFromHeaders` now emits a
greppable `auth_role_claim_missing userId=… role=…` on `console.warn` when the `user_role` claim is
absent or unparseable, and **still returns Supervisor**. Five tests fence it, including one that
asserts the Supervisor default survives — this task instruments, it does not flip.

`console.warn` for the same reason as S3: the function is a pure header reader with no `requestId`,
and threading one through it just for this would be worse than the inconsistency.

**Task 5 (fail closed) is NOT done, and must not be done from a checklist.** It is blocked on Step
2's observation window — at least one full JWT lifetime of production data, ideally a week — and the
plan's Step 3 gate is explicit: any non-zero count means fix the Supabase hook first. Flipping the
default with a broken hook logs those users out with no self-service recovery. The two pinning tests
at `lib/auth/session.test.ts` still assert the Supervisor default, deliberately.

| Metric | Value |
|---|---|
| occurrences of `auth_role_claim_missing` | *awaiting deploy* |
| distinct userIds affected | *awaiting deploy* |
| observation window | *not started* |

### S1 — CSP (tasks 6–8; task 9 deliberately not done)

The policy is **still report-only**. A test asserts that, so a future edit cannot flip it by
accident without deleting an assertion that says why.

**Task 6 — reports now go somewhere.** The plan is right that the old policy had no reporting
directive at all, making report-only mode invisible outside each user's devtools console. Added
`POST /api/csp-report` plus both delivery channels: `report-to csp-endpoint` (modern Reporting API,
paired with a `Reporting-Endpoints` response header) and `report-uri` (the deprecated fallback
Safari and older Chrome still use). The sink is written to the plan's constraints for
unauthenticated public input:

- rate limited — it goes through `withApi`, so the per-IP bucket applies like any other route,
- bounded — a body over 8 KB is rejected **before** it is parsed,
- allowlisted — only five known fields are read, each truncated to 256 chars, so a hostile client
  cannot write unbounded log lines,
- silent — the response never echoes a submitted value,
- no database access and no user data.

It reads **both** wire formats: the legacy `{"csp-report": {…}}` envelope with hyphenated keys and
the Reporting API's `[{type, body}]` array with camelCase keys. Eight tests, and it was also
exercised against a running production server: `202` for a real report, `413` oversized, `400`
malformed, with the violation appearing in the server log as `csp_violation`.

**This adds the app's first genuinely public API route, so the guard-coverage invariant moved:
60 of 62 route files call an auth guard** (was 60 of 61 — note the audit's "59 of 61" was already
stale before this phase). The third exception is `/api/csp-report`, unauthenticated **by necessity**:
a violation can occur on the sign-in page or after a session expires, and browsers post reports
without credentials. It is a public prefix in `lib/auth/constants.ts` — **not** a `proxy.ts` edit,
so the strip-before-exit invariant is untouched and `git diff -- proxy.ts` is still empty. Two new
tests in `tests/proxy.test.ts` prove the sink skips auth work *and* still has forged `x-siteops-*`
headers stripped, because public must not mean unguarded.

**Task 7 — `'unsafe-eval'` dropped** from `script-src`. Nothing in the production stack needs it:
Serwist/Workbox and `posthog-js` are both eval-free and Next's dev overlay never ships. Whether any
real browser disagrees is now observable, which it was not before — that is what Task 6 bought.

**Task 8 — the honest outcome is the plan's Step 3, recorded rather than hand-waved.** The inline
script inventory came back **empty**: zero `<script>` tags and zero `dangerouslySetInnerHTML` across
`app/`. The only `'unsafe-inline'` need is Next's own hydration payload. A nonce scheme requires a
per-request nonce from middleware, which cannot be embedded into the statically prerendered auth
routes (`/`, `/auth/sign-in`, `/auth/sign-up`, `/auth/change-password` all prerender). **Decision:
keep `'unsafe-inline'` for `script-src` and take the win on every other directive.** The reasoning
is in a comment in `lib/security/headers.ts` so it does not have to be rediscovered.

Also in this pass:
- `object-src 'none'` added (Task 8 Step 4) — free, blocks legacy plugin injection.
- `worker-src 'self'` added — the service worker is same-origin and nothing else may register one.
- **Phase 6's leftover closed:** `https://fonts.googleapis.com` and `https://fonts.gstatic.com` are
  gone from `style-src` / `font-src`. Phase 6 removed the Material Symbols webfont and `Inter` comes
  through `next/font/google`, which self-hosts at build time, so no external font origin is
  reachable any more.

The live policy on a running production build:

```
default-src 'self'; connect-src 'self' <supabase> <posthog> https://*.upstash.io wss://<supabase>;
script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:;
font-src 'self' data:; object-src 'none'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self';
form-action 'self'; report-to csp-endpoint; report-uri /api/csp-report
```

**Task 9 (flip to enforcing) was deliberately not done.** Its own Step 1 gates it on a full week of
clean report-only data, which now — for the first time — can actually be collected. Flipping without
it risks a broken service worker in an installed PWA, the worst failure mode in this plan.

### Regression checklist — what passed and what could not run

Passed: `npm run lint` (exit 0), `npm run test -- --testTimeout=30000` (759 passing),
`tests/proxy.test.ts` (17 passing), `npm run build`, and the live `curl -sI` header check showing
HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
`Permissions-Policy`, `Reporting-Endpoints` and the report-only CSP.

Invariants re-verified: `git diff -- proxy.ts` empty; `git diff -- lib/export/serialize.ts
lib/errors/ lib/ui/toast.ts` empty; `sql.raw` count unchanged at 8; rate-limit keys still userId
first, IP second.

**Could not run:**

- **`npm run test:e2e` — still red for the pre-existing Phase 3 reason**
  (`e2e/route-migration.spec.ts` imports `betterAuthUsers`, which `@/lib/db/schema` does not
  export). Unchanged by this phase, and identical to the failure Phase 6 recorded. The plan names
  e2e as the **main guard for S1 and S2**, so that guard remains unavailable — a standing gap that
  outlives this phase.
- **`npm run audit:ci`** — non-zero on the two triaged browserslist advisories above.
- **The S4 empirical check** (spray many endpoints under the per-path limit, see a 429): needs a
  real Upstash instance in a production environment.
- **The F14 latency re-measurement** the checklist asks for: no baseline figure was recorded in
  Phase 5, so there is nothing to compare against. The structural argument holds — same
  `ephemeralCache`, one `Promise.all` — but it is unmeasured.
- **Every S1/S2 behavioural check needing a running deploy**: CSP behaviour in an installed PWA,
  SW registration and update, offline navigation, PostHog and Supabase realtime under the tightened
  policy, and the S2 sign-in matrix.

### Database

**No schema change, no writes, and no database access of any kind.** Nothing in this phase touches
the data layer.

### Still open from this phase

1. **S2 Task 5** — fail closed, gated on the observation window.
2. **S1 Task 9** — flip to enforcing, gated on a week of clean reports.
3. **`browserslist` / `@serwist/next`** — the one remaining audit finding.
4. **e2e is red** — `betterAuthUsers` import, inherited from Phase 3, and it is the named guard for
   this phase's two riskiest changes.
5. **`/api/csp-report` has no retention or volume ceiling beyond the rate limiter.** It writes to the
   application log; if report volume is high after deploy, that is log spend. Worth watching in the
   first days.

---

## Follow-up (2026-09-04) — e2e quarantined and un-blocked

`npm run test:e2e` has been **red since phase 3** and was named the main guard for phase 6's UI work
and this phase's S1/S2. Investigating it turned up something worse than the stale import.

### What was actually wrong

The `betterAuthUsers` import was only the visible symptom. Two deeper problems:

1. **The specs test a removed feature.** Every test in `route-migration.spec.ts` and in
   `tools-inventory.spec.ts`'s Supervisor block begins with self-service sign-up. SiteOps disabled
   that deliberately — `/api/auth/create-profile` always returns 410 ("closed / invite-only") and
   accounts are provisioned via `POST /api/admin/users`. Those tests could not pass against any
   database.

2. **They write to the production database.** `route-migration.spec.ts:68` promoted a user with a
   direct `db.update(betterAuthUsers).set({ role: 'Admin' })`, and `supabase.auth.signUp()` creates
   real auth rows. Playwright's `webServer` runs `npm run dev`, which loads `.env.local` — the
   production Supabase pooler. **There is no non-prod environment in this repo**, so a green run of
   this suite would have littered production with `supervisor.<timestamp>@example.com` accounts.
   Committed `test-results/*/error-context.md` artifacts show a pre-session run did execute these.

The stale import was, ironically, the only thing preventing that: it was a module-load error, so it
failed the entire run at **collection** time and took the harmless smoke specs down with it.

### What was done

Quarantine, not repair — repairing them properly needs an auth fixture on a non-prod environment,
which is infrastructure work and the user's call.

- `route-migration.spec.ts` — the `db` / `betterAuthUsers` imports removed (this is what makes the
  suite collectable again), all three tests wrapped in a skipped describe. **The assertions were
  kept**: they are still correct, and only the way they obtain a session is wrong. The header
  records both blockers and what restoring them requires.
- `tools-inventory.spec.ts` — the Supervisor authz block skipped for the same reason, matching the
  `test.skip(true, "…")` idiom the file's Admin block already used.
- `smoke.spec.ts` — **left running**, and one genuinely stale assertion fixed. It looked for a
  `/sign in/i` heading; the redesign replaced that with the "SITEOPS" wordmark, so the test broke on
  a copy change while the page worked. It now asserts the controls a user must find (email,
  password, "Authorize Access"), queried by label — which doubles as a check that the inputs stay
  properly associated. Smoke touches no auth and no database.

Chromium was missing from this machine's Playwright cache (`npx playwright install chromium`), which
had been masking the smoke result behind a launch error.

**Result: `npm run test:e2e` → 3 passed, 12 skipped, 0 failed.** Green for the first time since
phase 3. It is a usable signal again rather than a hard error, and unit coverage is unchanged at 759
passing. What it does **not** yet do is guard the phase 6 / phase 7 UI and auth changes — the skipped
12 are exactly that coverage.

### Still required

Seed a dedicated Supervisor and an Admin account on a **non-prod** database, load them through a
Playwright `storageState` fixture, and delete `signUp()` rather than repairing it. Until a non-prod
environment exists, no browser test may create or mutate a user.

Minor: `test-results/` is committed rather than gitignored, so every Playwright run shows up as
deleted/modified files. Worth ignoring, but not changed here — it is unrelated to this phase.
