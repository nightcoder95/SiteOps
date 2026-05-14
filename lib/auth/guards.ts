import { NextRequest } from "next/server";

import { safeGetSessionFromHeaders, type Session } from "@/lib/auth/session";

type GuardSuccess = { session: Session };
type GuardFailure = { error: "UNAUTHORIZED" | "FORBIDDEN"; status: 401 | 403 };
type GuardRole = "any" | "admin" | "site_access";

export async function getSessionFromRequest(request: NextRequest) {
  const session = await safeGetSessionFromHeaders(request.headers as Headers);
  return session;
}

async function requireRole(request: NextRequest, role: GuardRole) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return { error: "UNAUTHORIZED", status: 401 } as GuardFailure;
  }

  if (role === "admin" && session.user.role !== "Admin") {
    return { error: "FORBIDDEN", status: 403 } as GuardFailure;
  }

  if (
    role === "site_access" &&
    session.user.role !== "Supervisor" &&
    session.user.role !== "Admin"
  ) {
    return { error: "FORBIDDEN", status: 403 } as GuardFailure;
  }

  return { session } as GuardSuccess;
}

export async function requireAuth(request: NextRequest) {
  return requireRole(request, "any");
}

export async function requireAdmin(request: NextRequest) {
  return requireRole(request, "admin");
}

export async function requireSiteAccess(request: NextRequest) {
  return requireRole(request, "site_access");
}
