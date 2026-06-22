import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { requireCapability } from "@/lib/auth/guards";
import { checkOwnership } from "@/lib/auth/ownership";
import { invalidateAdminAnalyticsCache } from "@/lib/cache/invalidate";
import { db } from "@/lib/db/client";
import { materialUnitRuleFor } from "@/lib/db/queries/materialUnitRule";
import { displayUnitName } from "@/lib/db/queries/materialUnits";
import {
  deleteEntryById,
  getEntryById,
  updateEntryById,
  type EntryType,
} from "@/lib/db/queries/entries";
import { unitMaster } from "@/lib/db/schema";
import { entryOwnerId, type LabourEntryRow, type MaterialEntryRow } from "@/lib/types/entry";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApiRoute } from "@/lib/http/withApi";
import { coerceDecimals } from "@/lib/services/decimals";
import { decimalFieldsFor, evaluateLabourSplit } from "@/lib/services/entries";
import { runNonCritical } from "@/lib/services/nonCritical";
import { assertInCatalogList } from "@/lib/validation/catalogList";
import {
  updateExpenseEntrySchema,
  updateIncidentEntrySchema,
  updateLabourEntrySchema,
  updateMachineryEntrySchema,
  updateMaterialEntrySchema,
} from "@/lib/validation/schemas";

type RouteCtx = { params: Promise<{ id: string }> };

// Entries on an archived site are read-only — block edits/deletes even for
// the original author so a reassigned/closed site can't be mutated.
async function siteIsArchived(entry: unknown): Promise<boolean> {
  const siteId = (entry as { siteId?: unknown }).siteId;
  if (typeof siteId !== "string") return false;
  const site = await db.query.sites.findFirst({
    where: (t, { eq }) => eq(t.siteId, siteId),
    columns: { archivedAt: true },
  });
  return !site || site.archivedAt != null;
}

function parseType(request: NextRequest): EntryType | null {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  if (
    type === "labour" ||
    type === "material" ||
    type === "machinery" ||
    type === "expense" ||
    type === "incident"
  ) {
    return type;
  }
  return null;
}

export const PATCH = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const auth = await requireCapability(request, "entry:update");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }

  const type = parseType(request);
  if (!type) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Missing or invalid type", 400, undefined, requestId);
  }

  const { id } = await context.params;

  const existing = await getEntryById(id, type);
  if (!existing) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Entry not found", 404, undefined, requestId);
  }

  const ownerId = entryOwnerId(existing);
  if (!checkOwnership(auth.session.user, ownerId)) {
    return errorResponse(ERROR_CODES.FORBIDDEN, "Cannot edit another supervisor's entry", 403, undefined, requestId);
  }

  if (await siteIsArchived(existing)) {
    return errorResponse(ERROR_CODES.CONFLICT, "Site is archived; entries are read-only", 409, undefined, requestId);
  }

  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return parsed.response;

  const schema =
    type === "labour"
      ? updateLabourEntrySchema
      : type === "material"
        ? updateMaterialEntrySchema
        : type === "machinery"
          ? updateMachineryEntrySchema
          : type === "expense"
            ? updateExpenseEntrySchema
            : type === "incident"
              ? updateIncidentEntrySchema
              : null;

  if (!schema) {
    return errorResponse(ERROR_CODES.INVALID_REQUEST, "Unsupported entry type", 400, undefined, requestId);
  }

  const validation = validateBody(schema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  const updateData: Record<string, unknown> = { ...validation.data };
  // Drizzle `decimal` columns are strings; coerce numeric money/quantity fields.
  coerceDecimals(updateData, decimalFieldsFor(type));

  // Former-enum fields are now managed catalog lists — validate membership when
  // the field is being changed, and normalize to the canonical stored value.
  const catalogFieldChecks: Array<[string, string]> = [];
  if (type === "material" && typeof updateData.workStage === "string") catalogFieldChecks.push(["Material Work Stage", "workStage"]);
  if (type === "expense" && typeof updateData.category === "string") catalogFieldChecks.push(["Expense Category", "category"]);
  if (type === "incident" && typeof updateData.incidentType === "string") catalogFieldChecks.push(["Incident Type", "incidentType"]);
  if (type === "incident" && typeof updateData.severity === "string") catalogFieldChecks.push(["Incident Severity", "severity"]);
  for (const [listKey, field] of catalogFieldChecks) {
    const check = await assertInCatalogList(listKey, updateData[field] as string);
    if (!check.ok) {
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, check.message, 400, undefined, requestId);
    }
    updateData[field] = check.value;
  }

  if (type === "labour") {
    const split = evaluateLabourSplit(existing as LabourEntryRow, updateData);
    if (!split.ok) {
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, split.message, 400, undefined, requestId);
    }
    Object.assign(updateData, split.patch);
  }
  if (
    type === "material" &&
    (
      "materialType" in updateData ||
      "materialTypeEnum" in updateData ||
      "unit" in updateData ||
      "unitMode" in updateData ||
      "unitMasterId" in updateData ||
      "unitCustomId" in updateData
    )
  ) {
    const material = existing as MaterialEntryRow;
    const targetMaterialType =
      typeof updateData.materialType === "string"
        ? updateData.materialType
        : typeof updateData.materialTypeEnum === "string"
          ? updateData.materialTypeEnum
          : typeof material.materialType === "string"
            ? material.materialType
            : "Custom";
    const unitRule = await materialUnitRuleFor(targetMaterialType);
    const activeUnits = await db
      .select({ unitId: unitMaster.unitId, label: unitMaster.label })
      .from(unitMaster)
      .where(eq(unitMaster.isActive, true));
    const submittedUnitMasterId =
      typeof updateData.unitMasterId === "string"
        ? updateData.unitMasterId
        : typeof material.unitMasterId === "string"
          ? material.unitMasterId
          : "";
    const submittedUnitName = submittedUnitMasterId
      ? displayUnitName(activeUnits.find((unit) => unit.unitId === submittedUnitMasterId)?.label ?? "")
      : typeof updateData.unit === "string"
        ? displayUnitName(updateData.unit)
        : typeof material.unit === "string"
          ? displayUnitName(material.unit)
          : "";
    const resolvedUnitName =
      unitRule.allowedNames.length === 1
        ? unitRule.preferredName
        : unitRule.allowedNames.includes(submittedUnitName)
          ? submittedUnitName
          : unitRule.preferredName;
    const resolvedUnit = activeUnits.find((unit) => displayUnitName(unit.label) === resolvedUnitName);

    if (!resolvedUnit) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        `${targetMaterialType} must use ${unitRule.allowedNames.join(" or ")} as the unit`,
        400,
        undefined,
        requestId,
      );
    }

    updateData.unitMode = "master";
    updateData.unitMasterId = resolvedUnit.unitId;
    updateData.unitCustomId = null;
    updateData.unit = resolvedUnitName;
  }

  try {
    const updated = await updateEntryById(id, type, updateData);

    runNonCritical(
      requestId,
      "analytics_cache_invalidation_failed",
      invalidateAdminAnalyticsCache(requestId),
    );

    return successResponse(updated, 200, requestId);
  } catch (dbError) {
    const handled = handleDbError(dbError, requestId);
    if (handled) return handled;
    throw dbError;
  }
});

export const DELETE = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const auth = await requireCapability(request, "entry:delete");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }

  const type = parseType(request);
  if (!type) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Missing or invalid type", 400, undefined, requestId);
  }

  const { id } = await context.params;

  const existing = await getEntryById(id, type);
  if (!existing) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Entry not found", 404, undefined, requestId);
  }

  const ownerId = entryOwnerId(existing);
  if (!checkOwnership(auth.session.user, ownerId)) {
    return errorResponse(ERROR_CODES.FORBIDDEN, "Cannot delete another supervisor's entry", 403, undefined, requestId);
  }

  if (await siteIsArchived(existing)) {
    return errorResponse(ERROR_CODES.CONFLICT, "Site is archived; entries are read-only", 409, undefined, requestId);
  }

  await deleteEntryById(id, type);

  runNonCritical(
    requestId,
    "analytics_cache_invalidation_failed",
    invalidateAdminAnalyticsCache(requestId),
  );

  return successResponse(null, 200, requestId);
});
