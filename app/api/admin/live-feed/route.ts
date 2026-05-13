import { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/auth/guards";
import { getOrSetJson } from "@/lib/cache/getOrSetJson";
import { liveFeedCacheKey } from "@/lib/cache/keys";
import { getActivitySince } from "@/lib/db/queries/liveFeed";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { logError } from "@/lib/logging/log";
import { generateRequestId } from "@/lib/utils/requestId";

export const maxDuration = 30;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(request: NextRequest) {
  const requestId = generateRequestId();

  try {
    const auth = await requireAdmin(request);
    if (!("session" in auth)) {
      return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
    }

    const { searchParams } = new URL(request.url);
    const lastActivityId = searchParams.get("lastActivityId");

    const since = lastActivityId ? new Date(lastActivityId) : new Date(0);
    if (Number.isNaN(since.getTime())) {
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Invalid lastActivityId", 400, undefined, requestId);
    }

    const start = Date.now();

    while (Date.now() - start < 25_000) {
      const { value: activity } = await getOrSetJson(
        requestId,
        liveFeedCacheKey(since.toISOString(), 50),
        2,
        async () => getActivitySince(since, 50)
      );
      if (activity.length > 0) {
        return successResponse(activity, 200, requestId);
      }
      await sleep(2_000);
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    logError(requestId, error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR, "An unexpected error occurred", 500, undefined, requestId);
  }
}
