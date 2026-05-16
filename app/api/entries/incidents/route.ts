import { requireSiteAccess } from "@/lib/auth/guards";
import { checkOwnership } from "@/lib/auth/ownership";
import { invalidateAdminAnalyticsCache } from "@/lib/cache/invalidate";
import { db } from "@/lib/db/client";
import { createNotification, getAllAdmins } from "@/lib/db/queries/notifications";
import { insertIncidentReport } from "@/lib/db/queries/entries";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";
import { runNonCritical } from "@/lib/services/nonCritical";
import { incidentEntrySchema } from "@/lib/validation/schemas";

export const POST = withApi(async ({ request, requestId }) => {
  const [auth, parsed] = await Promise.all([
    requireSiteAccess(request),
    parseJsonBody(request, requestId),
  ]);

  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }
  if (!parsed.ok) return parsed.response;

  const validation = validateBody(incidentEntrySchema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  const { siteId, incidentType, severity, description, durationEstimate } = validation.data;

  const site = await db.query.sites.findFirst({
    where: (t, { eq }) => eq(t.siteId, siteId),
    columns: { supervisorId: true, name: true, archivedAt: true },
  });

  if (!site || site.archivedAt) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Site not found", 404, undefined, requestId);
  }

  if (!checkOwnership(auth.session.user, site.supervisorId)) {
    return errorResponse(ERROR_CODES.FORBIDDEN, "You can only report incidents for sites you supervise", 403, undefined, requestId);
  }

  try {
    const incident = await insertIncidentReport({
      siteId,
      incidentType,
      severity: severity ?? "Low",
      description,
      durationEstimate: durationEstimate ?? null,
      reportedBy: auth.session.user.id,
    });

    const admins = await getAllAdmins();
    runNonCritical(
      requestId,
      "incident_notification_failed",
      Promise.all(
        admins.map((admin) =>
          createNotification(
            admin.id,
            "incident",
            `Incident at ${site.name}`,
            description,
            `/app/sites/${siteId}`,
          ),
        ),
      ),
      { siteId },
    );

    runNonCritical(
      requestId,
      "analytics_cache_invalidation_failed",
      invalidateAdminAnalyticsCache(requestId),
    );

    return successResponse(incident, 201, requestId);
  } catch (dbError) {
    const handled = handleDbError(dbError, requestId);
    if (handled) return handled;
    throw dbError;
  }
});
