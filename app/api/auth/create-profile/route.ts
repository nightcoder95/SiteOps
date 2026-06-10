import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse } from "@/lib/errors/response";
import { withApi } from "@/lib/http/withApi";

// SiteOps is closed / invite-only: self-service profile creation is disabled.
// Accounts (and their profiles) are provisioned by admins via
// POST /api/admin/users. This endpoint is kept (not deleted) so it can be
// re-enabled if self-signup ever returns; for now it always 410s.
export const POST = withApi(async ({ requestId }) => {
  return errorResponse(
    ERROR_CODES.FORBIDDEN,
    "Self-service registration is disabled. Contact your administrator.",
    410,
    undefined,
    requestId,
  );
});

/* --- Original self-signup implementation (kept for future re-enable) ---
import { createSupabaseServerClient } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";
import { successResponse } from "@/lib/errors/response";

export const POST = withApi(async ({ requestId }) => {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return errorResponse(ERROR_CODES.UNAUTHORIZED, "Unauthorized", 401, undefined, requestId);
  }
  await db
    .insert(userProfiles)
    .values({ userId: user.id })
    .onConflictDoNothing({ target: userProfiles.userId });
  return successResponse({ success: true }, 200, requestId);
});
*/
