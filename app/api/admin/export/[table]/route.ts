// app/api/admin/export/[table]/route.ts
import { scheduleAudit } from "@/lib/audit/log";
import { requireCapability } from "@/lib/auth/guards";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse } from "@/lib/errors/response";
import { applyCsvView, hasUserColumns } from "@/lib/export/csvView";
import { readTable } from "@/lib/export/snapshot";
import { toCsv } from "@/lib/export/serialize";
import { getTableEntry } from "@/lib/export/tableRegistry";
import { buildUserDirectory } from "@/lib/export/userDirectory";
import { withApiRoute } from "@/lib/http/withApi";

export const maxDuration = 60;

type Ctx = { params: Promise<{ table: string }> };

export const GET = withApiRoute<Ctx>(async ({ request, requestId }, ctx) => {
  const auth = await requireCapability(request, "data:export");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
  }

  const { table } = await ctx.params;
  // Allowlist: an unknown param is a 400 and never reaches SQL.
  if (!getTableEntry(table)) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, "Unknown table", 400, undefined, requestId);
  }

  let csv: string;
  try {
    const raw = await readTable(table);
    // CSV is the human-friendly view: drop noise/empty columns and resolve
    // user-id columns to "Name (Role)". The user directory (an auth.users read)
    // is only built when the table actually has user-id columns.
    const dir = hasUserColumns(raw.columns) ? await buildUserDirectory() : undefined;
    const view = applyCsvView(raw.rows, raw.columns, dir);
    csv = toCsv(view.rows, view.columns);
    scheduleAudit({
      actorUserId: auth.session.user.id,
      action: "data.export.table",
      resourceType: "table",
      resourceId: table,
      allowed: true,
      role: auth.session.user.role,
      metadata: { rowCount: view.rows.length },
    });
  } catch {
    return errorResponse(ERROR_CODES.INTERNAL_ERROR, "Table export failed", 500, undefined, requestId);
  }

  const filename = `siteops-${table}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
      "x-request-id": requestId,
    },
  });
});
