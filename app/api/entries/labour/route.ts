import { requireSiteAccess } from "@/lib/auth/guards";
import { assertSiteWritable } from "@/lib/auth/siteWritable";
import { invalidateAdminAnalyticsCache } from "@/lib/cache/invalidate";
import { insertLabourEntry } from "@/lib/db/queries/entries";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";
import { runNonCritical } from "@/lib/services/nonCritical";
import { assertInCatalogList } from "@/lib/validation/catalogList";
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

  let canonicalWorkStage: string | null = null;
  if (typeof validation.data.workStage === "string" && validation.data.workStage.trim()) {
    const workStageCheck = await assertInCatalogList("Work Stage", validation.data.workStage);
    if (!workStageCheck.ok) {
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, workStageCheck.message, 400, undefined, requestId);
    }
    canonicalWorkStage = workStageCheck.value;
  }

  const writable = await assertSiteWritable({
    request,
    siteId,
    requestId,
    forbiddenMessage: "You can only log entries for sites you supervise",
  });
  if (!writable.ok) return writable.response;

  try {
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
      workStage: canonicalWorkStage,
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
