import { logWarn } from "@/lib/logging/log";

import {
  analyticsCacheKey,
  categoryListCacheKey,
  categoryTreeCacheKey,
  siteCacheKey,
  userProfileCacheKey,
} from "@/lib/cache/keys";
import { redis } from "@/lib/cache/redis";

const analyticsPeriods = ["7d", "30d", "90d"];

export async function invalidateAdminAnalyticsCache(requestId: string) {
  const r = redis;
  if (!r) return;

  try {
    await Promise.all(analyticsPeriods.map((p) => r.del(analyticsCacheKey(p))));
  } catch (error) {
    logWarn(requestId, "cache_invalidate_error", { error: String(error) });
  }
}

export async function invalidateSiteCache(siteId: string, requestId: string) {
  const r = redis;
  if (!r) return;

  try {
    await r.del(siteCacheKey(siteId));
  } catch (error) {
    logWarn(requestId, "cache_invalidate_error", { key: siteCacheKey(siteId), error: String(error) });
  }
}

export async function invalidateUserProfileCache(userId: string, requestId: string) {
  const r = redis;
  if (!r) return;

  try {
    await r.del(userProfileCacheKey(userId));
  } catch (error) {
    logWarn(requestId, "cache_invalidate_error", { key: userProfileCacheKey(userId), error: String(error) });
  }
}

export async function invalidateCategoryListCache(requestId: string) {
  const r = redis;
  if (!r) return;

  try {
    await r.del(categoryListCacheKey());
  } catch (error) {
    logWarn(requestId, "cache_invalidate_error", { key: categoryListCacheKey(), error: String(error) });
  }
}

export async function invalidateCategoryTreeCache(categoryId: string, requestId: string) {
  const r = redis;
  if (!r) return;

  try {
    await Promise.all([
      r.del(categoryTreeCacheKey(categoryId)),
      r.del(categoryListCacheKey()),
    ]);
  } catch (error) {
    logWarn(requestId, "cache_invalidate_error", {
      key: categoryTreeCacheKey(categoryId),
      error: String(error),
    });
  }
}
