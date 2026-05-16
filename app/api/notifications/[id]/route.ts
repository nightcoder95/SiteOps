import { requireAuth } from "@/lib/auth/guards";
import { markNotificationRead } from "@/lib/db/queries/notifications";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { withApiRoute } from "@/lib/http/withApi";

type RouteCtx = { params: Promise<{ id: string }> };

export const PATCH = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const auth = await requireAuth(request);
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }

  const { id } = await context.params;

  const updated = await markNotificationRead(id, auth.session.user.id);
  if (!updated) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Notification not found", 404, undefined, requestId);
  }

  return successResponse(updated, 200, requestId);
});
