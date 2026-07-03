import { requireCapability } from "@/lib/auth/guards";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { handleDbError } from "@/lib/errors/db";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";
import { CategoryNotFound, createTool } from "@/lib/tools/manage";
import { listTools } from "@/lib/tools/query";
import { ERROR_CODES } from "@/lib/errors/codes";
import { createToolSchema } from "@/lib/validation/toolSchemas";

// GET /api/tools — list tools with computed free + assignments + version.
// Supports ?q= name/code search. Capability: tool:read.
export const GET = withApi(async ({ request, requestId }) => {
  const auth = await requireCapability(request, "tool:read");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }
  const q = new URL(request.url).searchParams.get("q") ?? undefined;
  const tools = await listTools(q);
  return successResponse({ tools }, 200, requestId);
});

// POST /api/tools — create a tool (mints code, writes opening movement).
// Capability: tool:manage.
export const POST = withApi(async ({ request, requestId }) => {
  const auth = await requireCapability(request, "tool:manage");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
  }

  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return parsed.response;
  const validation = validateBody(createToolSchema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  try {
    const tool = await createTool({
      name: validation.data.name,
      categoryId: validation.data.categoryId,
      icon: validation.data.icon ?? null,
      openingStock: validation.data.openingStock,
      actorUserId: auth.session.user.id,
    });
    return successResponse(tool, 201, requestId);
  } catch (err) {
    if (err instanceof CategoryNotFound) {
      return errorResponse(ERROR_CODES.NOT_FOUND, "Tool category not found", 404, undefined, requestId);
    }
    const handled = handleDbError(err, requestId);
    if (handled) return handled;
    throw err;
  }
});
