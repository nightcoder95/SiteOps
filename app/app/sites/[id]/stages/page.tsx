import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { checkOwnership } from "@/lib/auth/ownership";
import { safeGetSessionFromHeaders } from "@/lib/auth/session";
import { buildStageSummary } from "@/lib/catalog/stageSummaryView";
import { db } from "@/lib/db/client";
import { loadActiveCatalogNames } from "@/lib/db/queries/catalogLists";
import { getStageAggregates } from "@/lib/db/queries/stageSummary";
import { getSiteById } from "@/lib/db/queries/sites";

import StageSummaryClient from "./StageSummaryClient";

export default async function SiteStagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = safeGetSessionFromHeaders(await headers());
  if (!session) {
    redirect("/auth/sign-in");
  }

  const { id: siteId } = await params;

  // Same guard chain as the operations pages: an unowned or archived site is
  // indistinguishable from a missing one, so ownership cannot be probed here.
  const site = await getSiteById(siteId);
  if (!site || site.archivedAt) notFound();
  if (!checkOwnership(session.user, site.supervisorId)) notFound();

  // Independent reads; one roundtrip's latency instead of two.
  const [aggregates, catalogOrder] = await Promise.all([
    getStageAggregates(db, siteId),
    loadActiveCatalogNames("Work Stage"),
  ]);

  return (
    <StageSummaryClient
      siteId={siteId}
      siteName={site.name}
      budget={site.budget ? Number(site.budget) : null}
      rows={buildStageSummary({ aggregates, catalogOrder })}
    />
  );
}
