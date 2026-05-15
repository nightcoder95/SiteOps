import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EntryForm } from "@/components/logs/EntryForm";
import { safeGetSessionFromHeaders } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { categories } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function LogsNewCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ categoryId: string }>;
  searchParams: Promise<{ siteId?: string }>;
}) {
  const session = await safeGetSessionFromHeaders(await headers());
  if (!session) redirect("/auth/sign-in");
  if (session.user.role !== "Supervisor" && session.user.role !== "Admin") {
    redirect("/app/dashboard");
  }

  const { categoryId } = await params;
  const { siteId } = await searchParams;

  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.categoryId, categoryId));
  const category = rows[0];
  if (!category) notFound();

  const backHref = siteId
    ? `/app/logs/new?siteId=${encodeURIComponent(siteId)}`
    : "/app/logs/new";

  return (
    <div className="flex flex-col gap-density-medium">
      <header>
        <Link
          href={backHref}
          className="mb-2 inline-flex items-center gap-1 font-label-md text-label-md uppercase text-primary"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
          Pick category
        </Link>
        <h2 className="font-headline-sm text-headline-sm text-on-background">Log {category.name}</h2>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Step 2 of 2 — fill the form to create a new entry.
        </p>
      </header>
      <EntryForm
        categoryId={category.categoryId}
        categoryName={category.name}
        siteId={siteId}
      />
    </div>
  );
}
