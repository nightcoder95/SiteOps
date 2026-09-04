import {
  AUTH_USER_EMAIL_HEADER,
  AUTH_USER_ID_HEADER,
  AUTH_USER_ROLE_HEADER,
  parseSessionRole,
} from "@/lib/auth/headers";
import { ROLES, type Role } from "@/lib/auth/roles";

export type SessionRole = Role;

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

  const parsedRole = parseSessionRole(headers.get(AUTH_USER_ROLE_HEADER));
  if (!parsedRole) {
    // A verified JWT with no usable user_role claim means the Supabase
    // custom_access_token hook did not run or was misconfigured. Today this
    // silently grants Supervisor — a real set of capabilities (create entries,
    // read sites), not a harmless default. Logged so the real-world rate can be
    // MEASURED before the default is changed to fail closed; flipping it while
    // the hook is broken for any user logs them out with no self-service
    // recovery. See .docs/2026-08-06-audit-remediation/phase-7, S2.
    //
    // console.warn, not lib/logging/log.ts: every logger there requires a
    // requestId and this is a pure header reader with no request in scope.
    // Threading a requestId through it just for this would be worse. The
    // message is a stable, greppable prefix for log search.
    console.warn(
      `auth_role_claim_missing userId=${userId} role=${
        headers.get(AUTH_USER_ROLE_HEADER) ?? "<absent>"
      }`,
    );
  }
  const role = parsedRole ?? ROLES.SUPERVISOR;
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
