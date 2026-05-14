import { Redis } from "@upstash/redis";

const hasRedisEnv =
  Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
  Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

if (process.env.NODE_ENV === "production" && !hasRedisEnv) {
  throw new Error(
    "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set in production"
  );
}

export const redis = hasRedisEnv ? Redis.fromEnv() : null;
