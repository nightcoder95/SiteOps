import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { safeGetSessionFromHeaders } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { categories } from "@/lib/db/schema";

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
  const initialCategories = list.map((c) => ({
    categoryId: c.categoryId,
    name: c.name,
    icon: c.icon,
  }));

  return (
    <div className="flex flex-col gap-density-medium">
      <header>
        <h2 className="font-headline-sm text-headline-sm text-on-background">Log Entry — Step 1 of 2</h2>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Pick a category to start logging.
        </p>
      </header>
      <LogsNewPageClient initialCategories={initialCategories} siteId={siteId} />
    </div>
  );
}
