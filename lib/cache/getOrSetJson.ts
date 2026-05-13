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

    const value = await compute();
    await redis.set(key, value, { ex: ttlSeconds });
    return { value, hit: false };
  } catch (error) {
    logWarn(requestId, "cache_error", { key, error: String(error) });
    const value = await compute();
    return { value, hit: false };
  }
}
