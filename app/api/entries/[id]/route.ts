import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { requireCapability } from "@/lib/auth/guards";
import { checkOwnership } from "@/lib/auth/ownership";
import { invalidateAdminAnalyticsCache } from "@/lib/cache/invalidate";
import { db } from "@/lib/db/client";
import { materialUnitRuleFor } from "@/lib/db/queries/materialUnitRule";
import {
  deleteEntryById,
  getEntryById,
  updateEntryById,
  type EntryType,
} from "@/lib/db/queries/entries";
import { unitMaster } from "@/lib/db/schema";
import { serverDescriptorFor } from "@/lib/entryTypes/server";
import { entryOwnerId, type LabourEntryRow, type MaterialEntryRow } from "@/lib/types/entry";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApiRoute } from "@/lib/http/withApi";
import { coerceDecimals } from "@/lib/services/decimals";
import { evaluateLabourSplit, resolveMaterialUnit } from "@/lib/services/entries";
import { runNonCritical } from "@/lib/services/nonCritical";
import { assertInCatalogList } from "@/lib/validation/catalogList";
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

  const descriptor = serverDescriptorFor(type);

  const validation = validateBody(descriptor.zodUpdate, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  const updateData: Record<string, unknown> = { ...validation.data };
  // Drizzle `decimal` columns are strings; coerce numeric money/quantity fields.
  coerceDecimals(updateData, descriptor.decimalFields);

  // Former-enum fields are now managed catalog lists — validate membership when
  // the field is being changed, and normalize to the canonical stored value.
  for (const [listKey, field] of descriptor.catalogFields) {
    // Only check a field this request is actually changing: a PATCH that omits
    // workStage must not be rejected for it, and sending null (un-tag)
    // deliberately skips the check.
    if (typeof updateData[field] !== "string") continue;
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
    // Precedence for "what unit did the user mean": an explicitly submitted
    // master id, else an explicitly submitted unit name, else whatever the row
    // already has. resolveMaterialUnit normalises the name itself.
    const submittedUnitName = submittedUnitMasterId
      ? (activeUnits.find((unit) => unit.unitId === submittedUnitMasterId)?.label ?? "")
      : typeof updateData.unit === "string"
        ? updateData.unit
        : typeof material.unit === "string"
          ? material.unit
          : "";

    const resolved = resolveMaterialUnit({
      materialType: targetMaterialType,
      rule: unitRule,
      submittedUnitName,
      activeUnits,
    });
    if (!resolved.ok) {
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, resolved.message, 400, undefined, requestId);
    }

    updateData.unitMode = "master";
    updateData.unitMasterId = resolved.unitId;
    updateData.unitCustomId = null;
    updateData.unit = resolved.unitName;
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
