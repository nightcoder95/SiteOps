import { eq } from "drizzle-orm";

import { requireSiteAccess } from "@/lib/auth/guards";
import { assertSiteWritable } from "@/lib/auth/siteWritable";
import { invalidateAdminAnalyticsCache } from "@/lib/cache/invalidate";
import { db } from "@/lib/db/client";
import {
  insertMaterialEntry,
} from "@/lib/db/queries/entries";
import { materialUnitRuleFor } from "@/lib/db/queries/materialUnitRule";
import { unitMaster } from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";
import { resolveMaterialUnit } from "@/lib/services/entries";
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

  const writable = await assertSiteWritable({
    request,
    siteId,
    requestId,
    forbiddenMessage: "You can only log entries for sites you supervise",
  });
  if (!writable.ok) return writable.response;

  try {
    const activeUnits = await db
      .select({ unitId: unitMaster.unitId, label: unitMaster.label })
      .from(unitMaster)
      .where(eq(unitMaster.isActive, true));
    // resolveMaterialUnit normalises the submitted name itself, so pass the raw
    // label through rather than double-normalising here.
    let submittedUnitName = "";
    if ("unitMasterId" in validation.data && validation.data.unitMasterId) {
      const submittedUnitMasterId = validation.data.unitMasterId;
      submittedUnitName =
        activeUnits.find((unit) => unit.unitId === submittedUnitMasterId)?.label ?? "";
    } else if ("unit" in validation.data && validation.data.unit) {
      submittedUnitName = validation.data.unit;
    }

    const resolved = resolveMaterialUnit({
      materialType,
      rule: unitRule,
      submittedUnitName,
      activeUnits,
    });
    if (!resolved.ok) {
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, resolved.message, 400, undefined, requestId);
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
      unitMasterId: resolved.unitId,
      unitCustomId: null,
      unit: resolved.unitName,
      workStage: canonicalWorkStage,
      cost: cost != null ? String(cost) : null,
      remarks: remarks || null,
      createdBy: writable.session.user.id,
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
