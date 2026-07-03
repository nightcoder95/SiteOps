import { requireCapability } from "@/lib/auth/guards";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { withApiRoute } from "@/lib/http/withApi";
import { clearToolMovements, listToolMovements } from "@/lib/tools/query";

type RouteCtx = { params: Promise<{ id: string }> };

// GET /api/tools/:id/movements — per-tool ledger timeline (paginated). tool:read.
export const GET = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const auth = await requireCapability(request, "tool:read");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }
  const { id } = await context.params;
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
  const movements = await listToolMovements(id, limit, offset);
  return successResponse({ movements, limit, offset }, 200, requestId);
});

// DELETE /api/tools/:id/movements — clear all movement history. tool:manage.
export const DELETE = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const auth = await requireCapability(request, "tool:manage");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
  }
  const { id } = await context.params;
  const deleted = await clearToolMovements(id);
  return successResponse({ deleted }, 200, requestId);
});
