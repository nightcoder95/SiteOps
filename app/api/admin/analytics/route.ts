import { requireAdmin } from "@/lib/auth/guards";
import { getAdminAnalytics, isAnalyticsPeriod } from "@/lib/db/queries/adminAnalytics";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { withApi } from "@/lib/http/withApi";

export const GET = withApi(async ({ request, requestId }) => {
  const auth = await requireAdmin(request);
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") ?? "30d";
  if (!isAnalyticsPeriod(period)) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Invalid period", 400, undefined, requestId);
  }

  return successResponse(await getAdminAnalytics(requestId, period), 200, requestId);
});
