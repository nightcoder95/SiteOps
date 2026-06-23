// app/api/admin/export/route.ts
import { scheduleAudit } from "@/lib/audit/log";
import { requireCapability } from "@/lib/auth/guards";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse } from "@/lib/errors/response";
import { readFullSnapshot } from "@/lib/export/snapshot";
import { toBackupJson } from "@/lib/export/serialize";
import { TABLE_KEYS } from "@/lib/export/tableRegistry";
import { withApi } from "@/lib/http/withApi";

// Generous ceiling for the whole-DB scan; raise in Vercel project settings if the
// data grows. Free-tier serverless caps wall-clock — see the plan's "Edge cases"
// if exports start timing out (trigger to move to streaming).
export const maxDuration = 60;

export const GET = withApi(async ({ request, requestId }) => {
  const auth = await requireCapability(request, "data:export");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
  }

  let snapshot: Awaited<ReturnType<typeof readFullSnapshot>>;
  try {
    snapshot = await readFullSnapshot();
  } catch {
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      "Backup export failed",
      500,
      undefined,
      requestId,
    );
  }

  const body = toBackupJson(snapshot, TABLE_KEYS);
  const rowCount = Object.values(snapshot).reduce((n, rows) => n + rows.length, 0);
  const filename = `siteops-backup-${new Date().toISOString().slice(0, 10)}.json`;

  // Full data egress is sensitive (PII: names, phone numbers) — audit it.
  scheduleAudit({
    actorUserId: auth.session.user.id,
    action: "data.export.full",
    resourceType: "backup",
    allowed: true,
    role: auth.session.user.role,
    metadata: { rowCount, tables: TABLE_KEYS.length },
  });

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
      "x-request-id": requestId,
    },
  });
});
