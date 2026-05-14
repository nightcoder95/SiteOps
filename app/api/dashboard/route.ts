import { requireSiteAccess } from "@/lib/auth/guards";
import { measureDbQuery } from "@/lib/db/timing";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { withApi } from "@/lib/http/withApi";
import { getDashboardData } from "@/lib/services/dashboard";

export const GET = withApi(async ({ request, requestId }) => {
  const auth = await requireSiteAccess(request);
  if (!("session" in auth)) {
    return errorResponse(
      auth.error,
      "Authentication required",
      auth.status,
      undefined,
      requestId
    );
  }

  const data = await measureDbQuery(requestId, "dashboard.aggregate", () =>
    getDashboardData(auth.session.user)
  );
  return successResponse(data, 200, requestId);
});
