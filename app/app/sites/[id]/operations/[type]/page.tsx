import { asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { db } from "@/lib/db/client";
import { checkOwnership } from "@/lib/auth/ownership";
import { safeGetSessionFromHeaders } from "@/lib/auth/session";
import { getEntriesBySite, type EntryType, type MaterialWorkStage } from "@/lib/db/queries/entries";
import { subcategories } from "@/lib/db/schema";
import { getSiteById } from "@/lib/db/queries/sites";
import { serializeRow } from "@/lib/utils/serialize";

import OperationDetailPageClient from "./OperationDetailPageClient";

const allowedTypes = ["labour", "material", "machinery", "expense", "incident"] as const;
const CATEGORY_NAME_BY_ENTRY_TYPE: Record<EntryType, string> = {
  labour: "Labour",
  material: "Materials",
  machinery: "Machinery/Equipment",
  expense: "Expenses",
  incident: "Incident",
};
const EXPENSE_CATEGORY_OPTIONS = ["Labour", "Materials", "Equipment", "Misc"] as const;
const INCIDENT_CATEGORY_OPTIONS = ["Safety", "Block"] as const;

async function getOperationCategoryOptions(type: EntryType) {
  if (type === "expense") {
    return [...EXPENSE_CATEGORY_OPTIONS];
  }
  if (type === "incident") {
    return [...INCIDENT_CATEGORY_OPTIONS];
  }

  const categoryName = CATEGORY_NAME_BY_ENTRY_TYPE[type];
  const categoryRow = await db.query.categories.findFirst({
    where: (table, { eq: equals }) => equals(table.name, categoryName),
    columns: { categoryId: true },
  });
  if (!categoryRow) {
    return [];
  }

  const rows = await db
    .select({ name: subcategories.name })
    .from(subcategories)
    .where(eq(subcategories.categoryId, categoryRow.categoryId))
    .orderBy(asc(subcategories.name));

  return rows.map((row) => row.name);
}

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
  const categoryOptions = await getOperationCategoryOptions(type as EntryType);
  // Deep-link target from global search (?highlight=<entryId>). Read server-side
  // and passed as a prop — the app reads query params via searchParams, not the
  // client useSearchParams hook.
  const highlight = getValue("highlight") ?? null;

  return (
    <OperationDetailPageClient
      site={serializeRow(site) as any}
      siteId={siteId}
      type={type as EntryType}
      initialEntries={serializeRow(entries) as any}
      initialFilters={initialFilters}
      categoryOptions={categoryOptions}
      highlightId={highlight}
    />
  );
}
