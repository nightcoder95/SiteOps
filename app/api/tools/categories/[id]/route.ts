import { requireCapability } from "@/lib/auth/guards";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApiRoute } from "@/lib/http/withApi";
import { updateCategory } from "@/lib/tools/categories";
import { patchCategorySchema } from "@/lib/validation/toolSchemas";

type RouteCtx = { params: Promise<{ id: string }> };

// PATCH /api/tools/categories/:id — rename / prefix / (de)activate / reorder.
// Capability: tool_category:manage. No DELETE — categories are deactivated, not
// deleted, when referenced (case 9); the FK restrict on tools.category_id backs
// this if a delete is ever added.
export const PATCH = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const auth = await requireCapability(request, "tool_category:manage");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
  }

  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return parsed.response;
  const validation = validateBody(patchCategorySchema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  const { id } = await context.params;
  try {
    const category = await updateCategory(id, validation.data);
    if (!category) return errorResponse(ERROR_CODES.NOT_FOUND, "Category not found", 404, undefined, requestId);
    return successResponse(category, 200, requestId);
  } catch (err) {
    const handled = handleDbError(err, requestId);
    if (handled) return handled;
    throw err;
  }
});
