import type { NextRequest } from "next/server";

import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse } from "@/lib/errors/response";
import { logError, logInfo } from "@/lib/logging/log";
import { generateRequestId } from "@/lib/utils/requestId";

type ApiHandlerContext = {
  request: NextRequest;
  requestId: string;
};

type ApiHandler = (args: ApiHandlerContext) => Promise<Response>;

export function withApi(handler: ApiHandler) {
  return async (request: NextRequest): Promise<Response> => {
    const requestId = generateRequestId();
    const startedAt = Date.now();

    try {
      const response = await handler({
        request,
        requestId,
      });
      const durationMs = Date.now() - startedAt;
      logInfo(requestId, "api_request", {
        method: request.method,
        pathname: new URL(request.url).pathname,
        status: response.status,
        durationMs,
      });
      return response;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      logError(requestId, error, {
        method: request.method,
        pathname: new URL(request.url).pathname,
        durationMs,
      });
      return errorResponse(
        ERROR_CODES.INTERNAL_ERROR,
        "An unexpected error occurred",
        500,
        undefined,
        requestId
      );
    }
  };
}
