import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { can } from "@/lib/auth/capabilities";
import { safeGetSessionFromHeaders } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { categories } from "@/lib/db/schema";
import { getAllSites, getSitesBySupervisor } from "@/lib/db/queries/sites";

import { LogsNewPageClient } from "./LogsNewPageClient";

export const dynamic = "force-dynamic";

export default async function LogsNewPage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string }>;
}) {
  const session = await safeGetSessionFromHeaders(await headers());
  if (!session) redirect("/auth/sign-in");
  if (session.user.role !== "Supervisor" && session.user.role !== "Admin") {
    redirect("/app/dashboard");
  }

  const { siteId } = await searchParams;
  const list = await db.select().from(categories);
  const sites =
    can(session.user.role, "site:read_all")
      ? await getAllSites()
      : await getSitesBySupervisor(session.user.id);
  const initialCategories = list.map((c) => ({
    categoryId: c.categoryId,
    name: c.name,
    icon: c.icon,
  }));
  const initialSites = sites.map((s) => ({
    siteId: s.siteId,
    name: s.name,
    location: s.location,
  }));

  return (
    <LogsNewPageClient
      initialCategories={initialCategories}
      initialSites={initialSites}
      siteId={siteId}
      role={session.user.role as "Admin" | "Supervisor"}
    />
  );
}
