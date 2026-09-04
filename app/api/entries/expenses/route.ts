import { requireSiteAccess } from "@/lib/auth/guards";
import { assertSiteWritable } from "@/lib/auth/siteWritable";
import { invalidateAdminAnalyticsCache } from "@/lib/cache/invalidate";
import { insertExpenseEntry } from "@/lib/db/queries/entries";
import { getSiteTrackedSpend } from "@/lib/db/queries/sites";
import { createNotification, getAllAdmins } from "@/lib/db/queries/notifications";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";
import { runNonCritical } from "@/lib/services/nonCritical";
import { assertInCatalogList } from "@/lib/validation/catalogList";
import { expenseEntrySchema } from "@/lib/validation/schemas";

async function notifyBudgetThreshold(
  siteId: string,
  supervisorId: string,
  totalSpend: string,
  budget: string,
) {
  const admins = await getAllAdmins();

  const title = "Budget threshold crossed";
  const message = `Site spend is at ${totalSpend} of budget ${budget}`;
  const link = `/app/sites/${siteId}`;

  await Promise.all([
    ...admins.map((a) => createNotification(a.id, "budget_alert", title, message, link)),
    createNotification(supervisorId, "budget_alert", title, message, link),
  ]);
}

export const POST = withApi(async ({ request, requestId }) => {
  const [auth, parsed] = await Promise.all([
    requireSiteAccess(request),
    parseJsonBody(request, requestId),
  ]);

  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }
  if (!parsed.ok) return parsed.response;

  const validation = validateBody(expenseEntrySchema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  const { siteId, date, description, amount } = validation.data;

  const categoryCheck = await assertInCatalogList("Expense Category", validation.data.category);
  if (!categoryCheck.ok) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, categoryCheck.message, 400, undefined, requestId);
  }
  const category = categoryCheck.value;

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
    const entry = await insertExpenseEntry({
      siteId,
      date,
      description,
      amount: String(amount),
      category,
      workStage: canonicalWorkStage,
      createdBy: writable.session.user.id,
    });

    const totalSpend = await getSiteTrackedSpend(siteId);
    if (writable.site.budget && Number(totalSpend) / Number(writable.site.budget) >= 0.8) {
      runNonCritical(
        requestId,
        "budget_threshold_notification_failed",
        notifyBudgetThreshold(siteId, writable.site.supervisorId, totalSpend, String(writable.site.budget)),
        { siteId },
      );
    }

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
