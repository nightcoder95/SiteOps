import { requireSiteAccess } from "@/lib/auth/guards";
import { checkOwnership } from "@/lib/auth/ownership";
import { invalidateAdminAnalyticsCache } from "@/lib/cache/invalidate";
import { db } from "@/lib/db/client";
import {
  findMatchingMaterialEntry,
  insertMaterialEntry,
  mergeMaterialEntry,
} from "@/lib/db/queries/entries";
import { materialUnitRuleFor } from "@/lib/db/queries/materialUnits";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";
import { runNonCritical } from "@/lib/services/nonCritical";
import { materialEntrySchema } from "@/lib/validation/schemas";

export const POST = withApi(async ({ request, requestId }) => {
  const [auth, parsed] = await Promise.all([
    requireSiteAccess(request),
    parseJsonBody(request, requestId),
  ]);

  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }
  if (!parsed.ok) return parsed.response;

  const validation = validateBody(materialEntrySchema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  const { siteId, date, quantity, workStage, cost, remarks } = validation.data;
  const materialType =
    "materialType" in validation.data
      ? (validation.data.materialType ?? "Custom")
      : "materialTypeEnum" in validation.data
        ? (validation.data.materialTypeEnum ?? "Custom")
        : "Custom";
  const unitRule = materialUnitRuleFor(materialType);

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
    const existing = await findMatchingMaterialEntry(siteId, date, materialType, workStage);
    if (existing) {
      const merged = await mergeMaterialEntry(existing.materialEntryId, {
        quantity: String(quantity),
        cost: String(cost),
        remarks: remarks || null,
      });

      runNonCritical(
        requestId,
        "analytics_cache_invalidation_failed",
        invalidateAdminAnalyticsCache(requestId),
      );

      return successResponse(merged, 200, requestId);
    }

    const entry = await insertMaterialEntry({
      siteId,
      date,
      materialType,
      materialTypeMode:
        "materialTypeMode" in validation.data ? validation.data.materialTypeMode : "default_enum",
      materialTypeEnum: "materialTypeEnum" in validation.data ? validation.data.materialTypeEnum : null,
      materialTypeCustomId:
        "materialTypeCustomId" in validation.data ? validation.data.materialTypeCustomId : null,
      quantity: String(quantity),
      unitMode: "unitMode" in validation.data ? validation.data.unitMode : "master",
      unitMasterId: "unitMasterId" in validation.data ? validation.data.unitMasterId : null,
      unitCustomId: "unitCustomId" in validation.data ? validation.data.unitCustomId : null,
      unit: unitRule.preferredName,
      workStage,
      cost: String(cost),
      remarks: remarks || null,
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
