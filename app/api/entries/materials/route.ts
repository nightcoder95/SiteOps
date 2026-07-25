import { eq } from "drizzle-orm";

import { requireSiteAccess } from "@/lib/auth/guards";
import { checkOwnership } from "@/lib/auth/ownership";
import { invalidateAdminAnalyticsCache } from "@/lib/cache/invalidate";
import { db } from "@/lib/db/client";
import {
  insertMaterialEntry,
} from "@/lib/db/queries/entries";
import { materialUnitRuleFor } from "@/lib/db/queries/materialUnitRule";
import { displayUnitName } from "@/lib/db/queries/materialUnits";
import { unitMaster } from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";
import { runNonCritical } from "@/lib/services/nonCritical";
import { assertInCatalogList } from "@/lib/validation/catalogList";
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

  const workStageCheck = await assertInCatalogList("Work Stage", workStage);
  if (!workStageCheck.ok) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, workStageCheck.message, 400, undefined, requestId);
  }
  const canonicalWorkStage = workStageCheck.value;

  const materialType =
    "materialType" in validation.data
      ? (validation.data.materialType ?? "Custom")
      : "materialTypeEnum" in validation.data
        ? (validation.data.materialTypeEnum ?? "Custom")
        : "Custom";
  const unitRule = await materialUnitRuleFor(materialType);

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
    const activeUnits = await db
      .select({ unitId: unitMaster.unitId, label: unitMaster.label })
      .from(unitMaster)
      .where(eq(unitMaster.isActive, true));
    let submittedUnitName = "";
    if ("unitMasterId" in validation.data && validation.data.unitMasterId) {
      const submittedUnitMasterId = validation.data.unitMasterId;
      submittedUnitName = displayUnitName(
        activeUnits.find((unit) => unit.unitId === submittedUnitMasterId)?.label ?? "",
      );
    } else if ("unit" in validation.data && validation.data.unit) {
      submittedUnitName = displayUnitName(validation.data.unit);
    }
    const resolvedUnitName =
      unitRule.allowedNames.length === 1
        ? unitRule.preferredName
        : unitRule.allowedNames.includes(submittedUnitName)
          ? submittedUnitName
          : null;
    const resolvedUnit = resolvedUnitName
      ? activeUnits.find((unit) => displayUnitName(unit.label) === resolvedUnitName)
      : null;

    if (!resolvedUnitName || !resolvedUnit) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        `${materialType} must use ${unitRule.allowedNames.join(" or ")} as the unit`,
        400,
        undefined,
        requestId,
      );
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
      unitMode: "master",
      unitMasterId: resolvedUnit.unitId,
      unitCustomId: null,
      unit: resolvedUnitName,
      workStage: canonicalWorkStage,
      cost: cost != null ? String(cost) : null,
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
