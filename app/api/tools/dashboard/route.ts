import { requireCapability } from "@/lib/auth/guards";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { withApi } from "@/lib/http/withApi";
import { dashboardAggregates } from "@/lib/tools/query";

// GET /api/tools/dashboard — aggregate strip for the hub + Home tile. tool:read.
export const GET = withApi(async ({ request, requestId }) => {
  const auth = await requireCapability(request, "tool:read");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }
  const dashboard = await dashboardAggregates();
  return successResponse(dashboard, 200, requestId);
});
