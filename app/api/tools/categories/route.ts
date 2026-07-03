import { requireCapability } from "@/lib/auth/guards";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";
import { createCategory, listCategories } from "@/lib/tools/categories";
import { createCategorySchema } from "@/lib/validation/toolSchemas";

// GET /api/tools/categories — list tool categories. Capability: tool:read.
export const GET = withApi(async ({ request, requestId }) => {
  const auth = await requireCapability(request, "tool:read");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }
  const categories = await listCategories();
  return successResponse({ categories }, 200, requestId);
});

// POST /api/tools/categories — create category. Capability: tool_category:manage.
export const POST = withApi(async ({ request, requestId }) => {
  const auth = await requireCapability(request, "tool_category:manage");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
  }

  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return parsed.response;
  const validation = validateBody(createCategorySchema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  try {
    const category = await createCategory(validation.data);
    return successResponse(category, 201, requestId);
  } catch (err) {
    const handled = handleDbError(err, requestId);
    if (handled) return handled; // 409 on dup name/prefix (case 9/10 substrate)
    throw err;
  }
});
