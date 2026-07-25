import { requireSiteAccess } from "@/lib/auth/guards";
import { checkOwnership } from "@/lib/auth/ownership";
import { invalidateAdminAnalyticsCache } from "@/lib/cache/invalidate";
import { db } from "@/lib/db/client";
import { insertMachineryEntry } from "@/lib/db/queries/entries";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";
import { runNonCritical } from "@/lib/services/nonCritical";
import { assertInCatalogList } from "@/lib/validation/catalogList";
import { machineryEntrySchema } from "@/lib/validation/schemas";

export const POST = withApi(async ({ request, requestId }) => {
  const [auth, parsed] = await Promise.all([
    requireSiteAccess(request),
    parseJsonBody(request, requestId),
  ]);

  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }
  if (!parsed.ok) return parsed.response;

  const validation = validateBody(machineryEntrySchema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  const { siteId, date, count, totalCost, remarks } = validation.data;
  const equipmentType =
    "equipmentType" in validation.data ? (validation.data.equipmentType ?? "Custom") : "Custom";

  let canonicalWorkStage: string | null = null;
  if (typeof validation.data.workStage === "string" && validation.data.workStage.trim()) {
    const workStageCheck = await assertInCatalogList("Work Stage", validation.data.workStage);
    if (!workStageCheck.ok) {
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, workStageCheck.message, 400, undefined, requestId);
    }
    canonicalWorkStage = workStageCheck.value;
  }

  const site = await db.query.sites.findFirst({
    where: (t, { eq }) => eq(t.siteId, siteId),
    columns: { supervisorId: true, archivedAt: true },
  });

  if (!site || site.archivedAt) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Site not found", 404, undefined, requestId);
  }

  if (!checkOwnership(auth.session.user, site.supervisorId)) {
    return errorResponse(ERROR_CODES.FORBIDDEN, "You can only log entries for sites you supervise", 403, undefined, requestId);
  }

  try {
    const entry = await insertMachineryEntry({
      siteId,
      date,
      equipmentType,
      equipmentTypeMode:
        "equipmentTypeMode" in validation.data ? validation.data.equipmentTypeMode : "default_enum",
      equipmentTypeCustomId:
        "equipmentTypeCustomId" in validation.data ? validation.data.equipmentTypeCustomId : null,
      count,
      hoursActive:
        "hoursActive" in validation.data && validation.data.hoursActive != null
          ? String(validation.data.hoursActive)
          : null,
      totalCost: String(totalCost),
      remarks: remarks || null,
      workStage: canonicalWorkStage,
      createdBy: auth.session.user.id,
    });

    runNonCritical(
      requestId,
      "analytics_cache_invalidation_failed",
      invalidateAdminAnalyticsCache(requestId),
    );

    return successResponse(entry, 201, requestId);
  } catch (dbError) {
    const handled = handleDbError(dbError, requestId);
    if (handled) return handled;
    throw dbError;
  }
});
