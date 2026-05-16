export type ClientResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      kind: 'endpoint_unavailable' | 'api_error' | 'network_error';
      message: string;
      endpoint: string;
      method: string;
      status?: number;
      details?: unknown;
    };

type FetchLike = typeof fetch;

function getMethod(init?: RequestInit) {
  return (init?.method ?? 'GET').toUpperCase();
}

async function readResponseBody(response: Response) {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    const text = await response.text();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

function extractApiMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const maybeError = payload as { error?: { message?: unknown }; message?: unknown };
  if (typeof maybeError.error?.message === 'string' && maybeError.error.message.trim()) {
    return maybeError.error.message;
  }
  if (typeof maybeError.message === 'string' && maybeError.message.trim()) {
    return maybeError.message;
  }

  return fallback;
}

function extractApiDetails(payload: unknown) {
  if (!payload || typeof payload !== 'object') return undefined;
  const maybeError = payload as { error?: { details?: unknown } };
  return maybeError.error?.details;
}

function extractApiCode(payload: unknown) {
  if (!payload || typeof payload !== 'object') return undefined;
  const maybeError = payload as { error?: { code?: unknown } };
  return typeof maybeError.error?.code === 'string' ? maybeError.error.code : undefined;
}

export async function requestJson<T>(
  endpoint: string,
  init: RequestInit = {},
  fetchImpl: FetchLike = fetch,
  cacheMode?: RequestCache
): Promise<ClientResult<T>> {
  const method = getMethod(init);
  const resolvedCacheMode = cacheMode ?? init.cache ?? (method === "GET" ? "no-store" : "default");

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      cache: resolvedCacheMode,
      ...init,
    });
  } catch (cause: any) {
    // Caller-driven AbortController cancellations must not surface as errors.
    const isAbort =
      cause?.name === 'AbortError' || init.signal?.aborted === true;
    return {
      ok: false,
      kind: 'network_error',
      message: isAbort ? 'Request aborted' : cause?.message ?? 'Unable to reach the server',
      endpoint,
      method,
    };
  }

  const payload = await readResponseBody(response);

  if (
    (response.status === 404 || response.status === 405) &&
    extractApiCode(payload) !== 'NOT_FOUND'
  ) {
    return {
      ok: false,
      kind: 'endpoint_unavailable',
      message: `The ${method} ${endpoint} endpoint is unavailable`,
      endpoint,
      method,
      status: response.status,
      details: extractApiDetails(payload),
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      kind: 'api_error',
      message: extractApiMessage(payload, `Request failed with status ${response.status}`),
      endpoint,
      method,
      status: response.status,
      details: extractApiDetails(payload) ?? payload,
    };
  }

  if (
    payload &&
    typeof payload === 'object' &&
    'success' in payload &&
    (payload as { success?: unknown }).success === false
  ) {
    return {
      ok: false,
      kind: 'api_error',
      message: extractApiMessage(payload, 'Request failed'),
      endpoint,
      method,
      status: response.status,
      details: extractApiDetails(payload),
    };
  }

  if (
    payload &&
    typeof payload === 'object' &&
    'success' in payload &&
    (payload as { success?: unknown }).success === true &&
    'data' in payload
  ) {
    return {
      ok: true,
      data: (payload as { data: T }).data,
    };
  }

  return {
    ok: true,
    data: payload as T,
  };
}
