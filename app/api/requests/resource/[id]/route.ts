import { requireAdmin } from "@/lib/auth/guards";
import { createNotification } from "@/lib/db/queries/notifications";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApiRoute } from "@/lib/http/withApi";
import { runNonCritical } from "@/lib/services/nonCritical";
import { reviewResourceRequest } from "@/lib/services/reviews";
import { updateResourceRequestSchema } from "@/lib/validation/schemas";

type RouteCtx = { params: Promise<{ id: string }> };

export const PATCH = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const auth = await requireAdmin(request);
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
  }

  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return parsed.response;
  const validation = validateBody(updateResourceRequestSchema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  const { id } = await context.params;

  try {
    const outcome = await reviewResourceRequest(id, validation.data.status, auth.session.user.id);
    if (outcome.type === "not_found") {
      return errorResponse(ERROR_CODES.NOT_FOUND, "Request not found", 404, undefined, requestId);
    }
    if (outcome.type === "conflict") {
      return errorResponse(ERROR_CODES.CONFLICT, "Request already reviewed", 409, undefined, requestId);
    }
    const row = outcome.row;

    runNonCritical(
      requestId,
      "resource_approval_notification_failed",
      createNotification(
        row.requestedBy,
        "approval",
        `Request ${row.status}`,
        "Your resource request was reviewed",
        `/app/sites/${row.siteId}`,
      ),
      { resourceRequestId: row.id },
    );

    return successResponse(row, 200, requestId);
  } catch (dbError) {
    const handled = handleDbError(dbError, requestId);
    if (handled) return handled;
    throw dbError;
  }
});
