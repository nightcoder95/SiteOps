import { eq } from "drizzle-orm";

import { requireSiteAccess } from "@/lib/auth/guards";
import { checkOwnership } from "@/lib/auth/ownership";
import { db } from "@/lib/db/client";
import { resourceRequests } from "@/lib/db/schema";
import { createNotification, getAllAdmins } from "@/lib/db/queries/notifications";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";
import { runNonCritical } from "@/lib/services/nonCritical";
import { resourceRequestSchema } from "@/lib/validation/schemas";

export const POST = withApi(async ({ request, requestId }) => {
  const auth = await requireSiteAccess(request);
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }

  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return parsed.response;
  const validation = validateBody(resourceRequestSchema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  const { siteId, type, details, reason } = validation.data;

  const site = await db.query.sites.findFirst({
    where: (t, { eq: opEq }) => opEq(t.siteId, siteId),
    columns: { supervisorId: true, archivedAt: true },
  });

  if (!site || site.archivedAt) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Site not found", 404, undefined, requestId);
  }

  if (!checkOwnership(auth.session.user, site.supervisorId)) {
    return errorResponse(ERROR_CODES.FORBIDDEN, "You can only request resources for sites you supervise", 403, undefined, requestId);
  }

  try {
    const inserted = await db
      .insert(resourceRequests)
      .values({
        siteId,
        requestType: type,
        details,
        reason,
        requestedBy: auth.session.user.id,
      })
      .returning();

    const admins = await getAllAdmins();
    runNonCritical(
      requestId,
      "resource_request_notification_failed",
      Promise.all(
        admins.map((a) =>
          createNotification(
            a.id,
            "approval",
            "Resource request submitted",
            details,
            `/app/sites/${siteId}`,
          ),
        ),
      ),
      { siteId },
    );

    return successResponse(inserted[0], 201, requestId);
  } catch (dbError) {
    const handled = handleDbError(dbError, requestId);
    if (handled) return handled;
    throw dbError;
  }
});

export const GET = withApi(async ({ request, requestId }) => {
  const auth = await requireSiteAccess(request);
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }

  if (auth.session.user.role === "Admin") {
    const result = await db.select().from(resourceRequests);
    return successResponse(result, 200, requestId);
  }

  const result = await db
    .select()
    .from(resourceRequests)
    .where(eq(resourceRequests.requestedBy, auth.session.user.id));

  return successResponse(result, 200, requestId);
});
