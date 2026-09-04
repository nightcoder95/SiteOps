import { sql } from "drizzle-orm";

import { getOrSetJson } from "@/lib/cache/getOrSetJson";
import { analyticsCacheKey } from "@/lib/cache/keys";
import { db } from "@/lib/db/client";
import { expenseEntries, incidentReports, labourEntries, machineryEntries, materialEntries, resourceRequests, sites } from "@/lib/db/schema";
import { measureDbQuery } from "@/lib/db/timing";

export const ANALYTICS_PERIODS = ["7d", "30d", "90d"] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

export function isAnalyticsPeriod(value: string): value is AnalyticsPeriod {
  return (ANALYTICS_PERIODS as readonly string[]).includes(value);
}

export type AdminAnalytics = {
  period: AnalyticsPeriod;
  sites: number;
  entries: {
    labour: number;
    material: number;
    machinery: number;
    expense: number;
    incident: number;
  };
  resourceRequests: number;
};

// Shared by GET /api/admin/analytics and the server-rendered analytics page, so
// the page can render real numbers without fetching its own HTTP route (audit
// F16). The 60s cache is part of the helper, so both callers hit the same entry.
export async function getAdminAnalytics(
  requestId: string,
  period: AnalyticsPeriod,
): Promise<AdminAnalytics> {
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { value } = await getOrSetJson<AdminAnalytics>(
    requestId,
    analyticsCacheKey(period),
    60,
    async () => {
      const [row] = await measureDbQuery(requestId, "admin.analytics.aggregate", () =>
        db.execute<{
          siteCount: string;
          labourCount: string;
          materialCount: string;
          machineryCount: string;
          expenseCount: string;
          incidentCount: string;
          requestsCount: string;
        }>(sql`
          SELECT
            (SELECT count(*) FROM ${sites})                                                              AS "siteCount",
            (SELECT count(*) FROM ${labourEntries}   WHERE ${labourEntries.createdAt}   > ${since})     AS "labourCount",
            (SELECT count(*) FROM ${materialEntries} WHERE ${materialEntries.createdAt} > ${since})     AS "materialCount",
            (SELECT count(*) FROM ${machineryEntries} WHERE ${machineryEntries.createdAt} > ${since})   AS "machineryCount",
            (SELECT count(*) FROM ${expenseEntries}  WHERE ${expenseEntries.createdAt}  > ${since})     AS "expenseCount",
            (SELECT count(*) FROM ${incidentReports} WHERE ${incidentReports.createdAt} > ${since})     AS "incidentCount",
            (SELECT count(*) FROM ${resourceRequests} WHERE ${resourceRequests.createdAt} > ${since})   AS "requestsCount"
        `)
      );

      return {
        period,
        sites: Number(row?.siteCount ?? 0),
        entries: {
          labour:   Number(row?.labourCount   ?? 0),
          material: Number(row?.materialCount  ?? 0),
          machinery:Number(row?.machineryCount ?? 0),
          expense:  Number(row?.expenseCount   ?? 0),
          incident: Number(row?.incidentCount  ?? 0),
        },
        resourceRequests: Number(row?.requestsCount ?? 0),
      };
    }
  );

  return value;
}
