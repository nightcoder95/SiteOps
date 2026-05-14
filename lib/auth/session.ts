import { eq } from "drizzle-orm";

import { getOrSetJson } from "@/lib/cache/getOrSetJson";
import { userProfileCacheKey } from "@/lib/cache/keys";
import {
  AUTH_USER_EMAIL_HEADER,
  AUTH_USER_ID_HEADER,
  AUTH_USER_ROLE_HEADER,
  parseSessionRole,
} from "@/lib/auth/headers";
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

async function getRoleFromCache(userId: string, requestId: string): Promise<SessionRole> {
  const { value: profile } = await getOrSetJson<
    Pick<typeof userProfiles.$inferSelect, "role"> | null
  >(
    requestId,
    userProfileCacheKey(userId),
    300,
    () =>
      db.query.userProfiles
        .findFirst({
          where: eq(userProfiles.userId, userId),
          columns: { role: true },
        })
        .then((row) => row ?? null)
  );
  return profile?.role ?? "Supervisor";
}

export async function getSessionUserFromHeaders(headers: Headers): Promise<SessionUser | null> {
  const userId = headers.get(AUTH_USER_ID_HEADER);
  if (!userId) {
    return null;
  }

  const requestId = generateRequestId();
  const headerRole = parseSessionRole(headers.get(AUTH_USER_ROLE_HEADER));
  const role = headerRole ?? (await getRoleFromCache(userId, requestId));
  const email = headers.get(AUTH_USER_EMAIL_HEADER) ?? "";

  return {
    id: userId,
    email,
    role,
  };
}

export async function safeGetSessionFromHeaders(headers: Headers): Promise<Session | null> {
  const user = await getSessionUserFromHeaders(headers);
  if (!user) {
    return null;
  }

  return { user };
}
