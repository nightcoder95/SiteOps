// SWR key builder for the global remarks search endpoint. The key IS the request
// URL, so SWR dedupes/caches per (query, limit, offset) and binds resolved data to
// the current key — out-of-order responses for stale keys are discarded.

export const SEARCH_MIN_CHARS = 2;
export const SUGGESTION_LIMIT = 7;
export const RESULTS_LIMIT = 50;

/** Returns the search endpoint URL, or null when the query is too short to fetch. */
export function searchKey(q: string, limit: number, offset = 0): string | null {
  const trimmed = q.trim();
  if (trimmed.length < SEARCH_MIN_CHARS) return null;
  const params = new URLSearchParams({
    q: trimmed,
    limit: String(limit),
    offset: String(offset),
  });
  return `/api/search/remarks?${params.toString()}`;
}
