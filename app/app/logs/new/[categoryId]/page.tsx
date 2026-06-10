import { eq } from "drizzle-orm";
import dynamicImport from "next/dynamic";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { resolveEntryKind } from "@/components/logs/entryFieldRegistry";

// Code-split the two entry forms (446 + ~210 LOC). Only one renders per request,
// so the browser downloads just the matching chunk. SSR stays on (default) — no
// hydration/SEO regression, only a lighter initial bundle for this route.
const DynamicEntryForm = dynamicImport(() =>
  import("@/components/logs/DynamicEntryForm").then((m) => m.DynamicEntryForm),
);
const EntryForm = dynamicImport(() =>
  import("@/components/logs/EntryForm").then((m) => m.EntryForm),
);
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
    <div className="max-w-2xl mx-auto space-y-6 pt-2">
      <div className="px-1 flex items-center gap-3">
        <Link
          href={backHref}
          className="p-2 -ml-2 rounded-xl hover:bg-white/5 transition-colors text-slate-400"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
        </Link>
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-white uppercase">Log {category.name}</h2>
          <p className="text-sm text-slate-500 font-medium italic">Step 2 of 2 — fill the form to create a new entry.</p>
        </div>
      </div>
      {resolveEntryKind(category.name) === "dynamic" ? (
        <DynamicEntryForm
          categoryId={category.categoryId}
          categoryName={category.name}
          siteId={siteId}
        />
      ) : (
        <EntryForm
          categoryId={category.categoryId}
          categoryName={category.name}
          siteId={siteId}
          role={session.user.role as "Admin" | "Supervisor"}
        />
      )}
    </div>
  );
}
