import { isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { TransferForm } from "@/components/transfers/TransferForm";
import { safeGetSessionFromHeaders } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { sites } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function TransfersNewPage({
  searchParams,
}: {
  searchParams: Promise<{ fromSite?: string }>;
}) {
  const session = await safeGetSessionFromHeaders(await headers());
  if (!session) redirect("/auth/sign-in");
  if (session.user.role !== "Supervisor") {
    return (
      <div className="flex flex-col gap-density-medium">
        <header>
          <h2 className="font-headline-sm text-headline-sm text-on-background">Supervisors only</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Cross-site transfers can only be requested by Supervisors.
          </p>
        </header>
      </div>
    );
  }

  const { fromSite } = await searchParams;
  const all = await db.select().from(sites).where(isNull(sites.archivedAt));
  const options = all.map((s) => ({
    siteId: s.siteId,
    name: s.name,
    location: s.location,
  }));

  return (
    <div className="flex flex-col gap-density-medium">
      <header>
        <h2 className="font-headline-sm text-headline-sm text-on-background">Transfer Resources</h2>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Move labour or materials between sites. Requires admin approval.
        </p>
      </header>
      <TransferForm sites={options} defaultFromSiteId={fromSite} />
    </div>
  );
}
