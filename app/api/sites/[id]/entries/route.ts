import { requireSiteAccess } from "@/lib/auth/guards";
import { checkOwnership } from "@/lib/auth/ownership";
import { getSiteById } from "@/lib/db/queries/sites";
import { getEntriesBySite } from "@/lib/db/queries/entries";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { withApiRoute } from "@/lib/http/withApi";

type RouteCtx = { params: Promise<{ id: string }> };

const allowedTypes = ["labour", "material", "machinery", "expense", "incident", "all"] as const;

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
  const type = searchParams.get("type");
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const limitRaw = searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;

  if (!type || !(allowedTypes as readonly string[]).includes(type)) {
    return errorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      "Invalid or missing type",
      400,
      undefined,
      requestId,
    );
  }

  const data = await getEntriesBySite(siteId, type as any, { from, to, limit });
  return successResponse(data, 200, requestId);
});
