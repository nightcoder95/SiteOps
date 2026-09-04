import { getOrSetJson } from "@/lib/cache/getOrSetJson";
import { userProfileCacheKey } from "@/lib/cache/keys";
import { db } from "@/lib/db/client";
import { measureDbQuery } from "@/lib/db/timing";
import type { userProfiles } from "@/lib/db/schema";

export type UserProfileRow = typeof userProfiles.$inferSelect;

// Shared by GET /api/users/me and the server-rendered profile page (audit F16).
// Caller supplies the user id it already authenticated — this helper performs no
// authorization of its own, so never pass an id that did not come from a
// verified session.
export async function getUserProfile(
  requestId: string,
  userId: string,
): Promise<UserProfileRow | null> {
  const { value } = await getOrSetJson<UserProfileRow | null>(
    requestId,
    userProfileCacheKey(userId),
    300,
    () =>
      measureDbQuery(requestId, "users.me.profile", () =>
        db.query.userProfiles
          .findFirst({ where: (t, { eq }) => eq(t.userId, userId) })
          .then((row) => row ?? null),
      ),
  );
  return value;
}
