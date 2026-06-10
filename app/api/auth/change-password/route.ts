import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireAuth } from "@/lib/auth/guards";
import { createSupabaseServiceClient } from "@/lib/auth/config";
import { invalidateUserClaims } from "@/lib/auth/refreshClaims";
import { invalidateUserProfileCache } from "@/lib/cache/invalidate";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { withNoStore } from "@/lib/http/cacheHeaders";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";

const changePasswordSchema = z
  .object({ newPassword: z.string().min(8).max(72) })
  .strict();

// Service-role endpoint: update the caller's password, clear the
// must_change_password flag (source of truth), and force a claim re-mint. The
// client must call supabase.auth.refreshSession() after this resolves so the
// cleared claim is picked up before navigating (otherwise the stale claim
// re-triggers the middleware redirect — §4.4).
export const POST = withApi(async ({ request, requestId }) => {
  const auth = await requireAuth(request);
  if (!("session" in auth)) {
    return withNoStore(
      errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId),
    );
  }

  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return withNoStore(parsed.response);
  const validation = validateBody(changePasswordSchema, parsed.data, requestId);
  if (!validation.ok) return withNoStore(validation.response);

  const userId = auth.session.user.id;
  const supabase = createSupabaseServiceClient();

  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    password: validation.data.newPassword,
  });
  if (updateError) {
    return withNoStore(
      errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        updateError.message ?? "Failed to update password",
        400,
        undefined,
        requestId,
      ),
    );
  }

  await db
    .update(userProfiles)
    .set({ mustChangePassword: false, updatedAt: new Date() })
    .where(eq(userProfiles.userId, userId));

  // Re-mint so the cleared must_change_password claim takes effect on refresh.
  await invalidateUserClaims(userId);
  await invalidateUserProfileCache(userId, requestId);

  return withNoStore(successResponse({ success: true }, 200, requestId));
});
