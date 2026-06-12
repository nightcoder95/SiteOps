import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { PageHero, PageStack } from "@/components/ui/page-primitives";
import { can } from "@/lib/auth/capabilities";
import { safeGetSessionFromHeaders } from "@/lib/auth/session";
import { listSupervisors, type SupervisorOption } from "@/lib/users/listSupervisors";

import { SitesNewPageClient } from "./SitesNewPageClient";

export const dynamic = "force-dynamic";

export default async function SitesNewPage() {
  const session = await safeGetSessionFromHeaders(await headers());
  if (!session) redirect("/auth/sign-in");
  if (!can(session.user.role, "site:create")) {
    redirect("/app/dashboard");
  }

  const supervisors: SupervisorOption[] = await listSupervisors();

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
