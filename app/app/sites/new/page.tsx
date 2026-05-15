import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { PageHero, PageStack } from "@/components/ui/page-primitives";
import { safeGetSessionFromHeaders } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";

import { SitesNewPageClient } from "./SitesNewPageClient";

export const dynamic = "force-dynamic";

export default async function SitesNewPage() {
  const session = await safeGetSessionFromHeaders(await headers());
  if (!session) redirect("/auth/sign-in");
  if (session.user.role !== "Supervisor" && session.user.role !== "Admin") {
    redirect("/app/dashboard");
  }

  let supervisors: { userId: string; designation: string | null }[] = [];
  if (session.user.role === "Admin") {
    const rows = await db
      .select({ userId: userProfiles.userId, designation: userProfiles.designation })
      .from(userProfiles)
      .where(eq(userProfiles.role, "Supervisor"));
    supervisors = rows;
  }

  return (
    <PageStack>
      <PageHero
        eyebrow="Create site"
        title="New construction site"
        description="Provide site basics. You can fine-tune budget and phase later."
      />
      <SitesNewPageClient
        role={session.user.role as "Admin" | "Supervisor"}
        supervisors={supervisors}
      />
    </PageStack>
  );
}
