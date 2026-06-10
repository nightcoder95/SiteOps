import { after } from "next/server";

import { db } from "@/lib/db/client";
import { auditLogs } from "@/lib/db/schema";
import { logWarn } from "@/lib/logging/log";

export type AuditEntry = {
  actorUserId: string | null;
  action: string; // permission.denied | role.changed | user.created
  resourceType?: string | null;
  resourceId?: string | null;
  allowed: boolean;
  role: string;
  metadata?: Record<string, unknown> | null;
};

// Insert a single audit row. Failures are swallowed (logged) — audit must never
// break or fail the user-facing request.
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      resourceType: entry.resourceType ?? null,
      resourceId: entry.resourceId ?? null,
      allowed: entry.allowed,
      role: entry.role,
      metadata: entry.metadata ?? null,
    });
  } catch (error) {
    logWarn("audit", "audit_write_failed", { action: entry.action, error: String(error) });
  }
}

// Schedule an audit write via Next.js `after()` so the insert runs after the
// response is sent (no user-facing latency) and is not truncated by a
// serverless context freeze the way a bare fire-and-forget promise can be.
export function scheduleAudit(entry: AuditEntry): void {
  after(() => {
    void recordAudit(entry);
  });
}
