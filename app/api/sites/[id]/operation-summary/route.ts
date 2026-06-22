import { requireSiteAccess } from "@/lib/auth/guards";
import { checkOwnership } from "@/lib/auth/ownership";
import { siteOperationSummary } from "@/lib/db/queries/entries";
import { withStatementTimeout } from "@/lib/db/guard";
import { getSiteById } from "@/lib/db/queries/sites";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { withApiRoute } from "@/lib/http/withApi";

type RouteCtx = { params: Promise<{ id: string }> };

export const GET = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const { id: siteId } = await context.params;

  const [auth, site] = await Promise.all([
    requireSiteAccess(request),
    getSiteById(siteId),
  ]);

  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }

  if (!site || site.archivedAt) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Site not found", 404, undefined, requestId);
  }

  if (!checkOwnership(auth.session.user, site.supervisorId)) {
    return errorResponse(
      ERROR_CODES.FORBIDDEN,
      "You can only view entries for sites you supervise",
      403,
      undefined,
      requestId,
    );
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? undefined;
  const data = await withStatementTimeout((tx) => siteOperationSummary(tx, siteId, date));
  return successResponse(data, 200, requestId);
});
