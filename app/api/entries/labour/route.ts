import { requireSiteAccess } from "@/lib/auth/guards";
import { checkOwnership } from "@/lib/auth/ownership";
import { invalidateAdminAnalyticsCache } from "@/lib/cache/invalidate";
import { db } from "@/lib/db/client";
import {
  findMatchingLabourEntry,
  insertLabourEntry,
  mergeLabourEntry,
} from "@/lib/db/queries/entries";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";
import { runNonCritical } from "@/lib/services/nonCritical";
import { isSplitLabourWorkType, labourEntrySchema } from "@/lib/validation/schemas";

export const POST = withApi(async ({ request, requestId }) => {
  const [auth, parsed] = await Promise.all([
    requireSiteAccess(request),
    parseJsonBody(request, requestId),
  ]);

  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }
  if (!parsed.ok) return parsed.response;

  const validation = validateBody(labourEntrySchema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  const { siteId, date, remarks } = validation.data;
  const workType =
    "workType" in validation.data
      ? (validation.data.workType ?? "Custom")
      : "workTypeEnum" in validation.data
        ? (validation.data.workTypeEnum ?? "Custom")
        : "Custom";
  const splitLabour = isSplitLabourWorkType(workType);
  const salaryAmount =
    "salaryAmount" in validation.data && validation.data.salaryAmount != null
      ? String(validation.data.salaryAmount)
      : "peopleCount" in validation.data && "wagePerHead" in validation.data
        ? String(Number(validation.data.peopleCount) * Number(validation.data.wagePerHead))
        : null;

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
    const existing = await findMatchingLabourEntry(siteId, date, workType);
    if (existing) {
      const merged = await mergeLabourEntry(existing.labourEntryId, {
        peopleCount: "peopleCount" in validation.data ? validation.data.peopleCount : 0,
        salaryAmount,
        masonCount: "masonCount" in validation.data ? validation.data.masonCount : null,
        masonSalaryAmount:
          "masonSalaryAmount" in validation.data
            ? String(validation.data.masonSalaryAmount)
            : null,
        helperCount: "helperCount" in validation.data ? validation.data.helperCount : null,
        helperSalaryAmount:
          "helperSalaryAmount" in validation.data
            ? String(validation.data.helperSalaryAmount)
            : null,
        remarks: remarks || null,
      });

      runNonCritical(
        requestId,
        "analytics_cache_invalidation_failed",
        invalidateAdminAnalyticsCache(requestId),
      );

      return successResponse(merged, 200, requestId);
    }

    const entry = await insertLabourEntry({
      siteId,
      date,
      workType,
      workTypeMode: "workTypeMode" in validation.data ? validation.data.workTypeMode : "default_enum",
      workTypeEnum: "workTypeEnum" in validation.data ? validation.data.workTypeEnum : null,
      workTypeCustomId: "workTypeCustomId" in validation.data ? validation.data.workTypeCustomId : null,
      peopleCount: "peopleCount" in validation.data ? validation.data.peopleCount : 0,
      wagePerHead: "wagePerHead" in validation.data ? String(validation.data.wagePerHead) : "0",
      salaryAmount,
      masonCount: splitLabour && "masonCount" in validation.data ? validation.data.masonCount : null,
      masonSalaryAmount:
        splitLabour && "masonSalaryAmount" in validation.data
          ? String(validation.data.masonSalaryAmount)
          : null,
      helperCount: splitLabour && "helperCount" in validation.data ? validation.data.helperCount : null,
      helperSalaryAmount:
        splitLabour && "helperSalaryAmount" in validation.data
          ? String(validation.data.helperSalaryAmount)
          : null,
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
