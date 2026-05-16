import { requireSiteAccess } from "@/lib/auth/guards";
import { checkOwnership } from "@/lib/auth/ownership";
import { invalidateAdminAnalyticsCache } from "@/lib/cache/invalidate";
import { db } from "@/lib/db/client";
import { insertExpenseEntry } from "@/lib/db/queries/entries";
import { getSiteTotalExpenses } from "@/lib/db/queries/sites";
import { createNotification, getAllAdmins } from "@/lib/db/queries/notifications";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";
import { runNonCritical } from "@/lib/services/nonCritical";
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

  const { siteId, date, description, amount, category } = validation.data;

  const site = await db.query.sites.findFirst({
    where: (t, { eq }) => eq(t.siteId, siteId),
    columns: { supervisorId: true, budget: true, name: true, archivedAt: true },
  });

  if (!site || site.archivedAt) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Site not found", 404, undefined, requestId);
  }

  if (!checkOwnership(auth.session.user, site.supervisorId)) {
    return errorResponse(ERROR_CODES.FORBIDDEN, "You can only log entries for sites you supervise", 403, undefined, requestId);
  }

  try {
    const entry = await insertExpenseEntry({
      siteId,
      date,
      description,
      amount: String(amount),
      category,
      createdBy: auth.session.user.id,
    });

    const totalSpend = await getSiteTotalExpenses(siteId);
    if (site.budget && Number(totalSpend) / Number(site.budget) >= 0.8) {
      runNonCritical(
        requestId,
        "budget_threshold_notification_failed",
        notifyBudgetThreshold(siteId, site.supervisorId, totalSpend, String(site.budget)),
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
