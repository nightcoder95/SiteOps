import { desc, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import type { ActivityItem } from "@/lib/types/domain";

export async function getActivitySince(since: Date, limit = 50) {
  // Use each table's public UUID (not the internal integer PK) to avoid exposing
  // auto-increment sequence ordering, which would allow enumeration attacks.
  const rows = await db.execute<ActivityItem>(sql`
    SELECT 'labour'   AS type, labour_entry_id    AS id, site_id AS "siteId", created_at AS "createdAt" FROM labour_entries    WHERE created_at > ${since}
    UNION ALL
    SELECT 'material' AS type, material_entry_id  AS id, site_id AS "siteId", created_at AS "createdAt" FROM material_entries  WHERE created_at > ${since}
    UNION ALL
    SELECT 'machinery' AS type, machinery_entry_id AS id, site_id AS "siteId", created_at AS "createdAt" FROM machinery_entries WHERE created_at > ${since}
    UNION ALL
    SELECT 'expense'  AS type, expense_entry_id   AS id, site_id AS "siteId", created_at AS "createdAt" FROM expense_entries   WHERE created_at > ${since}
    UNION ALL
    SELECT 'incident' AS type, incident_report_id AS id, site_id AS "siteId", created_at AS "createdAt" FROM incident_reports  WHERE created_at > ${since}
    ORDER BY "createdAt" DESC
    LIMIT ${limit}
  `);

  return rows;
}
