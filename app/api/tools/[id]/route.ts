import { requireCapability } from "@/lib/auth/guards";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApiRoute } from "@/lib/http/withApi";
import { CategoryNotFound, deleteTool, updateTool } from "@/lib/tools/manage";
import { getTool } from "@/lib/tools/query";
import { patchToolSchema } from "@/lib/validation/toolSchemas";

type RouteCtx = { params: Promise<{ id: string }> };

// GET /api/tools/:id — single tool + assignments. Capability: tool:read.
export const GET = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const auth = await requireCapability(request, "tool:read");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }
  const { id } = await context.params;
  const tool = await getTool(id);
  if (!tool) return errorResponse(ERROR_CODES.NOT_FOUND, "Tool not found", 404, undefined, requestId);
  return successResponse(tool, 200, requestId);
});

// PATCH /api/tools/:id — edit name/category/icon (not quantities). tool:manage.
export const PATCH = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const auth = await requireCapability(request, "tool:manage");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
  }

  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return parsed.response;
  const validation = validateBody(patchToolSchema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  const { id } = await context.params;
  try {
    const tool = await updateTool({
      toolId: id,
      name: validation.data.name,
      categoryId: validation.data.categoryId,
      icon: validation.data.icon,
      actorUserId: auth.session.user.id,
    });
    if (!tool) return errorResponse(ERROR_CODES.NOT_FOUND, "Tool not found", 404, undefined, requestId);
    return successResponse(tool, 200, requestId);
  } catch (err) {
    if (err instanceof CategoryNotFound) {
      return errorResponse(ERROR_CODES.NOT_FOUND, "Tool category not found", 404, undefined, requestId);
    }
    const handled = handleDbError(err, requestId);
    if (handled) return handled;
    throw err;
  }
});

// DELETE /api/tools/:id — soft-delete; guarded (case 7). ?force=true → return-all.
export const DELETE = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const auth = await requireCapability(request, "tool:delete");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
  }

  const { id } = await context.params;
  const force = new URL(request.url).searchParams.get("force") === "true";
  const result = await deleteTool({ toolId: id, force, actorUserId: auth.session.user.id });
  if (!result.ok) {
    return errorResponse(
      ERROR_CODES.CONFLICT,
      "Tool has units deployed to sites — return them first, or use force delete",
      409,
      { reason: result.reason },
      requestId,
    );
  }
  return successResponse(null, 200, requestId);
});
