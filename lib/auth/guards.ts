import { NextRequest } from "next/server";

import { safeGetSessionFromHeaders, type Session } from "@/lib/auth/session";

type GuardSuccess = { session: Session };
type GuardFailure = { error: "UNAUTHORIZED" | "FORBIDDEN"; status: 401 | 403 };

export async function getSessionFromRequest(request: NextRequest) {
  const session = await safeGetSessionFromHeaders(request.headers as Headers);
  return session;
}

export async function requireAuth(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return { error: "UNAUTHORIZED", status: 401 } as GuardFailure;
  }
  return { session } as GuardSuccess;
}

export async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return { error: "UNAUTHORIZED", status: 401 } as GuardFailure;
  }
  if (session.user.role !== "Admin") {
    return { error: "FORBIDDEN", status: 403 } as GuardFailure;
  }
  return { session } as GuardSuccess;
}

export async function requireSiteAccess(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return { error: "UNAUTHORIZED", status: 401 } as GuardFailure;
  }

  if (session.user.role !== "Supervisor" && session.user.role !== "Admin") {
    return { error: "FORBIDDEN", status: 403 } as GuardFailure;
  }

  return { session } as GuardSuccess;
}
