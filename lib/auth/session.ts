import {
  AUTH_USER_EMAIL_HEADER,
  AUTH_USER_ID_HEADER,
  AUTH_USER_ROLE_HEADER,
  parseSessionRole,
} from "@/lib/auth/headers";

export type SessionRole = "Admin" | "Supervisor";

export type SessionUser = {
  id: string;
  email: string;
  role: SessionRole;
};

export type Session = {
  user: SessionUser;
};

// Role is sourced from the `user_role` JWT claim (injected by the Supabase
// custom_access_token hook) and forwarded as a request header by middleware.
// We trust the header here; no DB/Redis lookup happens on the hot path.
// Stale role after promotion/demotion is bounded by JWT TTL — call
// invalidateUserClaims() (lib/auth/refreshClaims) to force a re-mint.
export function getSessionUserFromHeaders(headers: Headers): SessionUser | null {
  const userId = headers.get(AUTH_USER_ID_HEADER);
  if (!userId) {
    return null;
  }

  const role = parseSessionRole(headers.get(AUTH_USER_ROLE_HEADER)) ?? "Supervisor";
  const email = headers.get(AUTH_USER_EMAIL_HEADER) ?? "";

  return {
    id: userId,
    email,
    role,
  };
}

export function safeGetSessionFromHeaders(headers: Headers): Session | null {
  const user = getSessionUserFromHeaders(headers);
  if (!user) {
    return null;
  }
  return { user };
}
