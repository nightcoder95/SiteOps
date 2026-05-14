import { sql } from "drizzle-orm";

import { requireAdmin } from "@/lib/auth/guards";
import { getOrSetJson } from "@/lib/cache/getOrSetJson";
import { analyticsCacheKey } from "@/lib/cache/keys";
import { db } from "@/lib/db/client";
import { expenseEntries, incidentReports, labourEntries, machineryEntries, materialEntries, resourceRequests, sites } from "@/lib/db/schema";
import { measureDbQuery } from "@/lib/db/timing";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { withApi } from "@/lib/http/withApi";

const allowedPeriods = ["7d", "30d", "90d"] as const;

export const GET = withApi(async ({ request, requestId }) => {
  const auth = await requireAdmin(request);
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") ?? "30d";
  if (!(allowedPeriods as readonly string[]).includes(period)) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Invalid period", 400, undefined, requestId);
  }

  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { value } = await getOrSetJson(
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

  return successResponse(value, 200, requestId);
});
