import { requireCapability } from "@/lib/auth/guards";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";
import { applyOneTool, ToolNotFound, type ApplyResult } from "@/lib/tools/applyBatch";
import { getTool } from "@/lib/tools/query";
import { batchSaveSchema } from "@/lib/validation/toolSchemas";

// POST /api/tools/batch-save — partial-apply batch (§6). Capability: tool:assign.
//
// Tools are processed SEQUENTIALLY on the single shared pool — each in its own
// short transaction. This is deliberate and MUST NOT be parallelized: parallel
// transactions would multiply connection demand and risk the pooler exhaustion
// this codebase has already fought (project_supabase_pooler_statement_timeout).
// Independence per tool gives true partial-apply — one bad tool never loses the
// good edits.
export const POST = withApi(async ({ request, requestId }) => {
  const auth = await requireCapability(request, "tool:assign");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
  }

  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return parsed.response;
  const validation = validateBody(batchSaveSchema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  const actorUserId = auth.session.user.id;
  const results: ApplyResult[] = [];

  // Sequential loop — NO Promise.all (see header comment).
  for (const payload of validation.data.tools) {
    try {
      results.push(await applyOneTool(payload, actorUserId));
    } catch (err) {
      if (err instanceof ToolNotFound) {
        const fresh = await getTool(payload.toolId);
        results.push({
          toolId: payload.toolId,
          status: "invalid",
          reason: "not_found",
          // getTool returns null for a missing/deleted tool; surface a minimal shell.
          tool:
            fresh ?? {
              toolId: payload.toolId,
              name: "",
              code: "",
              categoryId: "",
              totalQuantity: 0,
              icon: null,
              version: payload.version,
              free: 0,
              assignments: [],
            },
        });
        continue;
      }
      throw err;
    }
  }

  return successResponse({ results }, 200, requestId);
});
