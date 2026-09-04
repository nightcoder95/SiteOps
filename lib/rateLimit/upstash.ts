import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// A module-level Map shared by every request handled by this warm instance.
//
// NOTE (verified against @upstash/ratelimit 2.0.8, Phase 5 / F14): passing this
// explicitly is a *no-op today* — when `ephemeralCache` is undefined the library
// already creates an equivalent Map internally. It is passed anyway so the
// behaviour is pinned here rather than depending on a library default that could
// change, and so `upstash.test.ts` has something real to fence.
//
// It is also NOT the per-request RTT saving the audit's F14 assumed. With
// `slidingWindow`, the cache is consulted only to reject identifiers already
// known to be over the limit; every allowed request still costs one Redis
// round-trip. Only `Ratelimit.cachedFixedWindow` serves allowed requests from
// local state, and that is a different limiting algorithm — a deliberate
// security/behaviour decision, not a drop-in optimisation.
const ephemeralCache = new Map<string, number>();

export const upstashRateLimit =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(60, "1 m"),
        analytics: true,
        ephemeralCache,
      })
    : null;

// Second, much looser bucket keyed by identity ALONE. The per-path limiter above
// is the primary control; this one exists so a leaked token cannot multiply its
// budget by the number of endpoints (~61 routes x 60/min = ~3660/min) simply by
// spraying requests across them.
//
// The value is deliberately generous: the heaviest client screen in this app
// (the admin catalog) issues well under 20 API requests per load, so 5 screens a
// minute is ~100, and 600 leaves 6x headroom before a legitimate power user is
// ever touched — while still cutting the cross-endpoint spray budget by ~6x.
// Tunable without a deploy via RATE_LIMIT_GLOBAL_PER_MINUTE.
const globalPerMinute = Number(process.env.RATE_LIMIT_GLOBAL_PER_MINUTE) || 600;

export const upstashGlobalRateLimit =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(globalPerMinute, "1 m"),
        analytics: true,
        // Shares the Map above so the two limiters cannot each grow their own.
        ephemeralCache,
      })
    : null;

if (!upstashRateLimit && process.env.NODE_ENV === "production") {
  // Fail-open is deliberate — failing closed would turn a Redis outage into a
  // self-inflicted outage of the entire API, which is worse than the abuse the
  // limiter prevents. But it must never be SILENT: without this line, a missing
  // env var in production leaves every endpoint unthrottled and nothing says so.
  //
  // console.error rather than lib/logging/log.ts: every logger there requires a
  // requestId, and there is no request at module scope. Honest over uniform.
  console.error(
    "[rate-limit] DISABLED in production: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN " +
      "are not set. All endpoints are unthrottled.",
  );
}
