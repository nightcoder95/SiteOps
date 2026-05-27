import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { checkOwnership } from "@/lib/auth/ownership";
import { safeGetSessionFromHeaders } from "@/lib/auth/session";
import { getEntriesBySite, type EntryType, type MaterialWorkStage } from "@/lib/db/queries/entries";
import { getSiteById } from "@/lib/db/queries/sites";
import { serializeRow } from "@/lib/utils/serialize";

import OperationDetailPageClient from "./OperationDetailPageClient";

const allowedTypes = ["labour", "material", "machinery", "expense", "incident"] as const;

export default async function OperationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; type: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = safeGetSessionFromHeaders(await headers());
  if (!session) {
    redirect("/auth/sign-in");
  }

  const { id: siteId, type } = await params;
  if (!(allowedTypes as readonly string[]).includes(type)) {
    notFound();
  }

  const site = await getSiteById(siteId);
  if (!site || site.archivedAt) {
    notFound();
  }

  if (!checkOwnership(session.user, site.supervisorId)) {
    notFound();
  }

  const query = await searchParams;
  const getValue = (key: string) => {
    const value = query[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const initialFilters = {
    from: getValue("from") ?? "",
    to: getValue("to") ?? "",
    category: getValue("category") ?? "",
    workStage: getValue("workStage") ?? "",
    sort: getValue("sort") ?? "newest",
  };

  const entries = await getEntriesBySite(siteId, type as EntryType, {
    from: initialFilters.from || undefined,
    to: initialFilters.to || undefined,
    category: initialFilters.category || undefined,
    workStage: (initialFilters.workStage || undefined) as MaterialWorkStage | undefined,
    sort: initialFilters.sort as "newest" | "oldest" | "highest_spend" | "lowest_spend",
    limit: 200,
  });

  return (
    <OperationDetailPageClient
      site={serializeRow(site) as any}
      siteId={siteId}
      type={type as EntryType}
      initialEntries={serializeRow(entries) as any}
      initialFilters={initialFilters}
    />
  );
}
