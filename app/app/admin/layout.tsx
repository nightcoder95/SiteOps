import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { can } from "@/lib/auth/capabilities";
import { safeGetSessionFromHeaders } from "@/lib/auth/session";

// Server-side guard for the entire /app/admin/* subtree. Reads the session from
// headers already populated by middleware (no extra DB call). Anyone without an
// admin-only capability gets a 404 — Supervisors can't even render admin pages,
// closing the gap where today only the nav link is hidden.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await safeGetSessionFromHeaders(await headers());
  if (!session || !can(session.user.role, "resource:manage_all")) {
    notFound();
  }
  return <>{children}</>;
}
