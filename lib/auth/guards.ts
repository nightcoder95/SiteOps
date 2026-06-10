import { NextRequest } from "next/server";

import { scheduleAudit } from "@/lib/audit/log";
import { can, type Capability } from "@/lib/auth/capabilities";
import { safeGetSessionFromHeaders, type Session } from "@/lib/auth/session";

type GuardSuccess = { session: Session };
type GuardFailure = { error: "UNAUTHORIZED" | "FORBIDDEN"; status: 401 | 403 };

export async function getSessionFromRequest(request: NextRequest) {
  const session = await safeGetSessionFromHeaders(request.headers as Headers);
  return session;
}

// Centralized capability guard. Every role-gated route authorizes through here
// (directly or via the thin wrappers below). On denial it schedules a
// `permission.denied` audit entry via after() — no added latency on the happy
// path, no audit write on success.
export async function requireCapability(request: NextRequest, capability: Capability) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return { error: "UNAUTHORIZED", status: 401 } as GuardFailure;
  }

  if (!can(session.user.role, capability)) {
    scheduleAudit({
      actorUserId: session.user.id,
      action: "permission.denied",
      resourceType: capability,
      allowed: false,
      role: session.user.role,
      metadata: { capability, path: new URL(request.url).pathname, method: request.method },
    });
    return { error: "FORBIDDEN", status: 403 } as GuardFailure;
  }

  return { session } as GuardSuccess;
}

// requireAuth: any authenticated session, no capability requirement.
export async function requireAuth(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return { error: "UNAUTHORIZED", status: 401 } as GuardFailure;
  }
  return { session } as GuardSuccess;
}

// Thin wrappers preserve the ~132 existing call sites unchanged. Both map onto
// an Admin-only / both-roles capability so the gate is identical to before:
//   - resource:manage_all is Admin-only      → requireAdmin === "must be Admin"
//   - site:read is held by every role         → requireSiteAccess === "authenticated"
export async function requireAdmin(request: NextRequest) {
  return requireCapability(request, "resource:manage_all");
}

export async function requireSiteAccess(request: NextRequest) {
  return requireCapability(request, "site:read");
}
