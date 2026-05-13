import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";

type AuditRow = {
  check: string;
  issues: number;
};

async function runAudit() {
  const checks = await db.execute<AuditRow>(sql`
    with checks as (
      select 'orphan_sites_supervisor'::text as check, count(*)::int as issues
      from sites s
      left join user_profiles up on up.user_id = s.supervisor_id
      where up.user_id is null

      union all
      select 'orphan_labour_site', count(*)::int
      from labour_entries e
      left join sites s on s.id = e.site_id
      where s.id is null

      union all
      select 'orphan_material_site', count(*)::int
      from material_entries e
      left join sites s on s.id = e.site_id
      where s.id is null

      union all
      select 'orphan_machinery_site', count(*)::int
      from machinery_entries e
      left join sites s on s.id = e.site_id
      where s.id is null

      union all
      select 'orphan_expense_site', count(*)::int
      from expense_entries e
      left join sites s on s.id = e.site_id
      where s.id is null

      union all
      select 'orphan_incident_site', count(*)::int
      from incident_reports e
      left join sites s on s.id = e.site_id
      where s.id is null

      union all
      select 'orphan_notification_user', count(*)::int
      from notifications n
      left join user_profiles up on up.user_id = n.user_id
      where up.user_id is null

      union all
      select 'resource_status_without_approver', count(*)::int
      from resource_requests r
      where r.status in ('Approved', 'Declined') and r.approved_by is null

      union all
      select 'duplicate_field_definition_label', count(*)::int
      from (
        select subcategory_id, label
        from field_definitions
        group by subcategory_id, label
        having count(*) > 1
      ) d
    )
    select check, issues from checks order by check;
  `);

  const failing = checks.filter((row) => row.issues > 0);
  console.log(JSON.stringify({ checks, failing }, null, 2));

  if (failing.length > 0) {
    process.exitCode = 1;
  }
}

runAudit().catch((error) => {
  console.error("DB audit failed", error);
  process.exit(1);
});
