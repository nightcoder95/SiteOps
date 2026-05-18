import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { EntryForm } from "@/components/logs/EntryForm";
import {
  ENTRY_TYPE_TO_CATEGORY_NAME,
  mapEntryToFormValues,
} from "@/components/logs/mapEntryToFormValues";
import { isEntryType } from "@/components/logs/entryTypes";
import { checkOwnership } from "@/lib/auth/ownership";
import { safeGetSessionFromHeaders } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { getEntryById } from "@/lib/db/queries/entries";
import { categories } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function LogsEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ entryId: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const session = await safeGetSessionFromHeaders(await headers());
  if (!session) redirect("/auth/sign-in");
  if (session.user.role !== "Supervisor" && session.user.role !== "Admin") {
    redirect("/app/dashboard");
  }

  const { entryId } = await params;
  const { type } = await searchParams;
  if (!isEntryType(type)) notFound();

  const entry = await getEntryById(entryId, type);
  if (!entry) notFound();

  const ownerId =
    (entry as any).createdBy ?? (entry as any).reportedBy ?? null;
  if (!checkOwnership(session.user, ownerId)) notFound();

  const categoryName = ENTRY_TYPE_TO_CATEGORY_NAME[type];
  let categoryId = "";
  if (type !== "incident" && type !== "expense") {
    const catRows = await db
      .select()
      .from(categories)
      .where(eq(categories.name, categoryName));
    const category = catRows[0];
    if (!category) notFound();
    categoryId = category.categoryId;
  }

  const initialValues = mapEntryToFormValues(
    entry as Record<string, unknown>,
    type,
    categoryId,
  );
  const entrySiteId = (entry as any).siteId as string | undefined;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pt-2">
      <div className="px-1">
        <h2 className="text-2xl font-extrabold tracking-tight text-white uppercase">Edit {categoryName}</h2>
        <p className="text-sm text-slate-500 font-medium italic mt-1.5">Update the fields and save your changes.</p>
      </div>
      <EntryForm
        categoryId={categoryId}
        categoryName={categoryName}
        siteId={entrySiteId}
        role={session.user.role as "Admin" | "Supervisor"}
        entryId={entryId}
        initialValues={initialValues}
      />
    </div>
  );
}
