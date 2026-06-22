import { requireSiteAccess } from "@/lib/auth/guards";
import { materialUnitRuleFor } from "@/lib/db/queries/materialUnitRule";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { withApi } from "@/lib/http/withApi";

// Client-facing resolver: the entry form asks "which units may this material
// type use, and which is preferred?". Backed by material_type_units with an
// all-active-units fallback (design §3.3).
export const GET = withApi(async ({ request, requestId }) => {
  const auth = await requireSiteAccess(request);
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }

  const materialType = new URL(request.url).searchParams.get("materialType") ?? "";
  const rule = await materialUnitRuleFor(materialType);
  return successResponse(rule, 200, requestId);
});
