import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { can } from "@/lib/auth/capabilities";
import { safeGetSessionFromHeaders } from "@/lib/auth/session";
import { ToolsHub } from "@/components/tools/ToolsHub";

export const dynamic = "force-dynamic";

// Company Tools hub — v1 Admin-only, gated on tool:read (Supervisors 404 until
// the capability is granted, mirroring the /app/admin subtree guard).
export default async function ToolsPage() {
  const session = await safeGetSessionFromHeaders(await headers());
  if (!session) redirect("/auth/sign-in");
  if (!can(session.user.role, "tool:read")) notFound();
  return <ToolsHub />;
}
