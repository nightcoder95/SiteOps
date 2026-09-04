import type { NextRequest } from "next/server";

import { requireCapability } from "@/lib/auth/guards";
import type { Capability } from "@/lib/auth/capabilities";
import type { Session } from "@/lib/auth/session";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse } from "@/lib/errors/response";
import { logError, logInfo } from "@/lib/logging/log";
import { applyRateLimit } from "@/lib/rateLimit/guard";
import { generateRequestId } from "@/lib/utils/requestId";

type ApiHandlerContext = {
  request: NextRequest;
  requestId: string;
};

type ApiHandler = (args: ApiHandlerContext) => Promise<Response>;
type ApiHandlerWithCtx<TCtx> = (args: ApiHandlerContext, ctx: TCtx) => Promise<Response>;

function withRequestIdHeader(response: Response, requestId: string): Response {
  // Cloning headers via Response constructor preserves body + status while
  // allowing us to set x-request-id. Skip when header already set.
  if (response.headers.get("x-request-id")) return response;
  const headers = new Headers(response.headers);
  headers.set("x-request-id", requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function runHandler<TCtx>(
  request: NextRequest,
  ctx: TCtx,
  handler: ApiHandler | ApiHandlerWithCtx<TCtx>
): Promise<Response> {
  const requestId = generateRequestId();
  const startedAt = Date.now();

  try {
    const limited = await applyRateLimit(request, requestId);
    if (limited) {
      const durationMs = Date.now() - startedAt;
      logInfo(requestId, "api_request", {
        method: request.method,
        pathname: new URL(request.url).pathname,
        status: limited.status,
        durationMs,
      });
      return withRequestIdHeader(limited, requestId);
    }

    const response = await (handler as ApiHandlerWithCtx<TCtx>)({ request, requestId }, ctx);
    const durationMs = Date.now() - startedAt;
    logInfo(requestId, "api_request", {
      method: request.method,
      pathname: new URL(request.url).pathname,
      status: response.status,
      durationMs,
    });
    return withRequestIdHeader(response, requestId);
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logError(requestId, error, {
      method: request.method,
      pathname: new URL(request.url).pathname,
      durationMs,
    });
    return withRequestIdHeader(
      errorResponse(
        ERROR_CODES.INTERNAL_ERROR,
        "An unexpected error occurred",
        500,
        undefined,
        requestId
      ),
      requestId
    );
  }
}

export function withApi(handler: ApiHandler) {
  return async (request: NextRequest): Promise<Response> => runHandler(request, undefined, handler);
}

// Variant for dynamic route handlers that receive a `{ params }` second arg.
export function withApiRoute<TCtx>(handler: ApiHandlerWithCtx<TCtx>) {
  return async (request: NextRequest, ctx: TCtx): Promise<Response> =>
    runHandler(request, ctx, handler);
}

type AuthedHandlerContext = ApiHandlerContext & { session: Session };

type AuthedOptions = { unauthorizedMessage?: string };

// Folds the 3-line auth-narrowing guard repeated in 59 route files into the
// wrapper, so handlers receive a guaranteed session. Composed ON TOP of
// withApi — rate limiting, request ids and logging are unchanged and still
// apply to rejected requests.
//
// Only requireCapability is wrapped. Routes using requireSiteAccess/requireAuth/
// requireAdmin are deliberately out of scope: re-pointing them at a capability
// check would silently change who can call them.
export function withAuthedApi(
  capability: Capability,
  handler: (args: AuthedHandlerContext) => Promise<Response>,
  options?: AuthedOptions,
) {
  return withApi(async ({ request, requestId }) => {
    const auth = await requireCapability(request, capability);
    if (!("session" in auth)) {
      return errorResponse(
        auth.error,
        options?.unauthorizedMessage ?? "Authentication required",
        auth.status,
        undefined,
        requestId,
      );
    }
    return handler({ request, requestId, session: auth.session });
  });
}

export function withAuthedApiRoute<TCtx>(
  capability: Capability,
  handler: (args: AuthedHandlerContext, ctx: TCtx) => Promise<Response>,
  options?: AuthedOptions,
) {
  return withApiRoute<TCtx>(async ({ request, requestId }, ctx) => {
    const auth = await requireCapability(request, capability);
    if (!("session" in auth)) {
      return errorResponse(
        auth.error,
        options?.unauthorizedMessage ?? "Authentication required",
        auth.status,
        undefined,
        requestId,
      );
    }
    return handler({ request, requestId, session: auth.session }, ctx);
  });
}
