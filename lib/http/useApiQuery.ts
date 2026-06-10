'use client';

import useSWR, { type SWRConfiguration, type SWRResponse } from 'swr';

import { requestJson, type ClientResult } from '@/lib/http/client';

export type ApiQueryError = Error & { code?: string; status?: number };

// SWR fetcher over the shared requestJson client. Throws on failure so SWR
// surfaces it via `error` (carrying the stable code for notifyError); returns
// the unwrapped `data` on success.
async function swrFetcher<T>(endpoint: string): Promise<T> {
  const res = await requestJson<T>(endpoint);
  if (!res.ok) {
    const err = new Error(res.message) as ApiQueryError;
    err.code = res.code;
    err.status = res.status;
    throw err;
  }
  return res.data;
}

// Client data-cache primitive (P2): instant stale render + background
// revalidate + request dedupe across the app. Pass `null` as the key to skip
// (conditional fetching). Compounds with the service worker's SWR API cache.
export function useApiQuery<T>(
  key: string | null,
  config?: SWRConfiguration<T, ApiQueryError>,
): SWRResponse<T, ApiQueryError> {
  return useSWR<T, ApiQueryError>(key, swrFetcher, config);
}

// Envelope-preserving variant. Unlike useApiQuery, the fetcher never throws —
// it resolves to the full ClientResult so callers keep their existing
// `result.ok` / `result.kind` ('endpoint_unavailable', validation, …) rendering
// verbatim. This swaps a page's useState+useEffect+load() trio for cache-then-
// revalidate, request dedupe, and focus revalidation with **zero** change to the
// error/branch UI. After a mutation, call the returned `mutate()` to resync.
async function resultFetcher<T>(endpoint: string): Promise<ClientResult<T>> {
  return requestJson<T>(endpoint);
}

export function useApiResult<T>(
  key: string | null,
  config?: SWRConfiguration<ClientResult<T>, ApiQueryError>,
): SWRResponse<ClientResult<T>, ApiQueryError> {
  return useSWR<ClientResult<T>, ApiQueryError>(key, resultFetcher, config);
}
