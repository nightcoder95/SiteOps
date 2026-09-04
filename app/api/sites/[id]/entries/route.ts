import { requireSiteAccess } from "@/lib/auth/guards";
import { checkOwnership } from "@/lib/auth/ownership";
import { getSiteById } from "@/lib/db/queries/sites";
import { encodeEntriesCursor, getEntriesBySite } from "@/lib/db/queries/entries";
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
  const category = searchParams.get("category") ?? undefined;
  const workStage = searchParams.get("workStage") ?? undefined;
  const sort = searchParams.get("sort") ?? undefined;
  const limitRaw = searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;
  // Keyset continuation: `after` is the identity id of the last row the client
  // already has. It is a UI continuation token, not a user-entered value, so a
  // malformed one falls back to the first page rather than a 400. The cursor
  // grants nothing — the query is still scoped to siteId, which was ownership-
  // checked above.
  const afterRaw = Number(searchParams.get("after"));
  const cursor =
    Number.isInteger(afterRaw) && afterRaw > 0
      ? encodeEntriesCursor({ id: afterRaw })
      : undefined;

  if (!type || !(allowedTypes as readonly string[]).includes(type)) {
    return errorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      "Invalid or missing type",
      400,
      undefined,
      requestId,
    );
  }

  const data = await getEntriesBySite(siteId, type as any, {
    from,
    to,
    limit,
    category,
    workStage: workStage as any,
    sort: sort as any,
    cursor,
  });
  return successResponse(data, 200, requestId);
});
