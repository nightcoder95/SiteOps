import { requireCapability } from "@/lib/auth/guards";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApiRoute } from "@/lib/http/withApi";
import { applyOneTool, ToolNotFound } from "@/lib/tools/applyBatch";
import { getTool } from "@/lib/tools/query";
import { translateToPayload } from "@/lib/tools/translate";
import { toolMovementSchema } from "@/lib/validation/toolSchemas";

type RouteCtx = { params: Promise<{ id: string }> };

// POST /api/tools/:id/move — Process single tool movements (send, return, transfer, add/remove stock).
export const POST = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const { id: toolId } = await context.params;

  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return parsed.response;
  const validation = validateBody(toolMovementSchema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  const body = validation.data;

  // Auth: stock changes need tool:manage, movements need tool:assign
  const requiredCap =
    body.kind === "add_stock" || body.kind === "remove_stock" ? "tool:manage" : "tool:assign";
  const auth = await requireCapability(request, requiredCap);
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Permission required", auth.status, undefined, requestId);
  }

  // Read current tool state
  const tool = await getTool(toolId);
  if (!tool) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Tool not found", 404, undefined, requestId);
  }

  // Translate action → applyOneTool payload
  const payload = translateToPayload(tool, body);

  try {
    const result = await applyOneTool(payload, auth.session.user.id);
    return successResponse(result, 200, requestId);
  } catch (err) {
    if (err instanceof ToolNotFound) {
      return errorResponse(ERROR_CODES.NOT_FOUND, "Tool not found", 404, undefined, requestId);
    }
    throw err;
  }
});
