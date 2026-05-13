import { eq } from "drizzle-orm";

import { getOrSetJson } from "@/lib/cache/getOrSetJson";
import { userProfileCacheKey } from "@/lib/cache/keys";
import { createSupabaseServerClient } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";
import { generateRequestId } from "@/lib/utils/requestId";

export type SessionRole = "Admin" | "Supervisor";

export type SessionUser = {
  id: string;
  email: string;
  role: SessionRole;
};

export type Session = {
  user: SessionUser;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const requestId = generateRequestId();
  const { value: profile } = await getOrSetJson<
    Pick<typeof userProfiles.$inferSelect, "role"> | null
  >(
    requestId,
    userProfileCacheKey(user.id),
    300,
    () =>
      db.query.userProfiles
        .findFirst({
          where: eq(userProfiles.userId, user.id),
          columns: { role: true },
        })
        .then((row) => row ?? null)
  );

  return {
    id: user.id,
    email: user.email ?? "",
    role: profile?.role ?? "Supervisor",
  };
}

export async function safeGetSessionFromHeaders(_headers: Headers): Promise<Session | null> {
  const user = await getSessionUser();
  if (!user) {
    return null;
  }

  return { user };
}
