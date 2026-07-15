import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { checkOwnership } from "@/lib/auth/ownership";
import { safeGetSessionFromHeaders } from "@/lib/auth/session";
import { getEntriesBySite, type EntryType, type MaterialWorkStage } from "@/lib/db/queries/entries";
import { getSiteById } from "@/lib/db/queries/sites";
import { serializeRow } from "@/lib/utils/serialize";
import {
  buildCombinedRows,
  computeCappedTypes,
  swapDateRangeIfInverted,
  SPEND_TYPES,
  type SpendType,
} from "@/components/operations/entryFormat";

import { getOperationCategoryOptions } from "./categoryOptions";
import OperationDetailPageClient from "./OperationDetailPageClient";
import AllOperationsPageClient from "./AllOperationsPageClient";

const allowedTypes = ["labour", "material", "machinery", "expense", "incident", "all"] as const;

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

  // Deep-link target from global search (?highlight=<entryId>). Read server-side
  // and passed as a prop — the app reads query params via searchParams, not the
  // client useSearchParams hook.
  const highlight = getValue("highlight") ?? null;

  if (type === "all") {
    const rawFrom = getValue("from") ?? "";
    const rawTo = getValue("to") ?? "";
    const sort = (getValue("sort") ?? "newest") as "newest" | "oldest" | "highest_spend" | "lowest_spend";
    const rawTypes = (getValue("types") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter((t): t is SpendType => (SPEND_TYPES as readonly string[]).includes(t));

    const { from, to, swapped } = swapDateRangeIfInverted(rawFrom, rawTo);

    const result = (await getEntriesBySite(siteId, "all", {
      from: from || undefined,
      to: to || undefined,
      sort,
      fullAll: true,
      limit: 200,
    })) as {
      labour: Record<string, unknown>[];
      material: Record<string, unknown>[];
      machinery: Record<string, unknown>[];
      expense: Record<string, unknown>[];
      incident: Record<string, unknown>[];
    };
    // getEntriesBySite("all", ...) returns { labour, material, machinery, expense, incident }.
    // Incident carries no spend and is excluded from this expense-focused view.
    const grouped = {
      labour: result.labour,
      material: result.material,
      machinery: result.machinery,
      expense: result.expense,
    };
    const combinedRows = buildCombinedRows(serializeRow(grouped) as any);
    const capped = computeCappedTypes(grouped, 200);

    return (
      <AllOperationsPageClient
        site={{ name: site.name, location: site.location }}
        siteId={siteId}
        initialRows={combinedRows}
        initialFilters={{ from, to, sort, types: rawTypes, adjustedRange: swapped }}
        capped={capped}
        highlightId={highlight}
      />
    );
  }

  const initialFilters = {
    from: getValue("from") ?? "",
    to: getValue("to") ?? "",
    category: getValue("category") ?? "",
    workStage: getValue("workStage") ?? "",
    sort: getValue("sort") ?? "newest",
  };

  const rawView = getValue("view");
  const initialView =
    type === "incident" ? "all"
    : highlight ? "all"           // global-search deep-link → show the list so the row highlights
    : rawView === "all" ? "all"
    : "category";

  const entries = await getEntriesBySite(siteId, type as EntryType, {
    from: initialFilters.from || undefined,
    to: initialFilters.to || undefined,
    category: initialFilters.category || undefined,
    workStage: (initialFilters.workStage || undefined) as MaterialWorkStage | undefined,
    sort: initialFilters.sort as "newest" | "oldest" | "highest_spend" | "lowest_spend",
    limit: 200,
  });
  const categoryOptions = await getOperationCategoryOptions(type as EntryType);

  return (
    <OperationDetailPageClient
      site={serializeRow(site) as any}
      siteId={siteId}
      type={type as EntryType}
      initialEntries={serializeRow(entries) as any}
      initialFilters={initialFilters}
      categoryOptions={categoryOptions}
      highlightId={highlight}
      initialView={initialView}
    />
  );
}
