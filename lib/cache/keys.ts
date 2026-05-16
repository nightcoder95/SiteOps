export function analyticsCacheKey(period: string) {
  return `admin:analytics:${period}`;
}

export function liveFeedCacheKey(sinceIso: string, limit: number) {
  return `admin:liveFeed:${sinceIso}:${limit}`;
}

export function siteCacheKey(siteId: string) {
  return `site:${siteId}`;
}

export function userProfileCacheKey(userId: string) {
  return `userProfile:${userId}`;
}

export function categoryListCacheKey() {
  return `categories:list`;
}

export function categoryTreeCacheKey(categoryId: string) {
  return `category:${categoryId}:tree`;
}
