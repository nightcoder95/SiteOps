import { createSupabaseServerClient } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { withApi } from "@/lib/http/withApi";

export const POST = withApi(async ({ requestId }) => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorResponse(ERROR_CODES.UNAUTHORIZED, "Unauthorized", 401, undefined, requestId);
  }

  await db
    .insert(userProfiles)
    .values({ userId: user.id })
    .onConflictDoNothing({ target: userProfiles.userId });

  return successResponse({ success: true }, 200, requestId);
});
