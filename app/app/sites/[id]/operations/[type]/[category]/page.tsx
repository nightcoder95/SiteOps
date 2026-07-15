import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { checkOwnership } from "@/lib/auth/ownership";
import { safeGetSessionFromHeaders } from "@/lib/auth/session";
import { getEntriesBySite, type EntryType, type MaterialWorkStage } from "@/lib/db/queries/entries";
import { getSiteById } from "@/lib/db/queries/sites";
import { serializeRow } from "@/lib/utils/serialize";

import { getOperationCategoryOptions } from "../categoryOptions";
import CategoryDetailPageClient from "./CategoryDetailPageClient";

const spendTypes = ["material", "expense", "labour", "machinery"] as const;

export default async function CategoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; type: string; category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = safeGetSessionFromHeaders(await headers());
  if (!session) {
    redirect("/auth/sign-in");
  }

  const { id: siteId, type, category: rawCategory } = await params;
  if (!(spendTypes as readonly string[]).includes(type)) {
    notFound();
  }

  const site = await getSiteById(siteId);
  if (!site || site.archivedAt) {
    notFound();
  }

  if (!checkOwnership(session.user, site.supervisorId)) {
    notFound();
  }

  const category = decodeURIComponent(rawCategory);
  if (!category) {
    notFound();
  }

  const query = await searchParams;
  const getValue = (key: string) => {
    const value = query[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const from = getValue("from") ?? "";
  const to = getValue("to") ?? "";
  const workStage = getValue("workStage") ?? "";
  const sort = (getValue("sort") ?? "newest") as "newest" | "oldest" | "highest_spend" | "lowest_spend";
  const highlight = getValue("highlight") ?? null;

  const options = await getOperationCategoryOptions(type as EntryType);
  if (!options.includes(category)) {
    // Custom types may not be in the catalog options — confirm at least one entry
    // exists for this category IGNORING date/stage filters, so a date range that
    // excludes everything does not produce a false 404.
    const anyForCategory = (await getEntriesBySite(siteId, type as EntryType, { category, limit: 1 })) as unknown[];
    if (anyForCategory.length === 0) notFound();
  }

  const entries = await getEntriesBySite(siteId, type as EntryType, {
    from: from || undefined,
    to: to || undefined,
    category,
    workStage: (workStage || undefined) as MaterialWorkStage | undefined,
    sort,
    limit: 200,
  });

  return (
    <CategoryDetailPageClient
      site={serializeRow(site) as any}
      siteId={siteId}
      type={type as EntryType}
      category={category}
      initialEntries={serializeRow(entries) as any}
      initialFilters={{ from, to, workStage, sort }}
      highlightId={highlight}
    />
  );
}
