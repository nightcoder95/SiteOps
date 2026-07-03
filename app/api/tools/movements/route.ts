import { requireCapability } from "@/lib/auth/guards";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { withApi } from "@/lib/http/withApi";
import { listGlobalMovements } from "@/lib/tools/query";
import { movementsQuerySchema } from "@/lib/validation/toolSchemas";

// GET /api/tools/movements — global ledger with filters (tool, site, kind) +
// pagination. Capability: tool:read.
export const GET = withApi(async ({ request, requestId }) => {
  const auth = await requireCapability(request, "tool:read");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }

  const url = new URL(request.url);
  const parsed = movementsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid query params", 400, parsed.error.flatten().fieldErrors, requestId);
  }
  const { toolId, siteId, kind, limit, offset } = parsed.data;
  const movements = await listGlobalMovements({ toolId, siteId, kind }, limit, offset);
  return successResponse({ movements, limit, offset }, 200, requestId);
});
