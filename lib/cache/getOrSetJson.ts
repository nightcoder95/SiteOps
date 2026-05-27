import { logInfo, logWarn } from "@/lib/logging/log";

import { redis } from "@/lib/cache/redis";

export async function getOrSetJson<T>(
  requestId: string,
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>
): Promise<{ value: T; hit: boolean }> {
  if (!redis) {
    const value = await compute();
    return { value, hit: false };
  }

  try {
    const cached = await redis.get<T>(key);
    if (cached !== null && cached !== undefined) {
      logInfo(requestId, "cache_hit", { key });
      return { value: cached, hit: true };
    }
    logInfo(requestId, "cache_miss", { key });
  } catch (error) {
    logWarn(requestId, "cache_error", { key, error: String(error) });
  }

  // compute() runs exactly once — a cache get OR set failure must not trigger
  // a second computation.
  const value = await compute();
  try {
    await redis.set(key, value, { ex: ttlSeconds });
  } catch (error) {
    logWarn(requestId, "cache_error", { key, error: String(error) });
  }
  return { value, hit: false };
}
