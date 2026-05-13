import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export const upstashRateLimit =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(60, "1 m"),
        analytics: true,
      })
    : null;
