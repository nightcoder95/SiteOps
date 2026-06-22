import { and, desc, eq, isNull } from "drizzle-orm";

import type { SessionUser } from "@/lib/auth/session";
import { withStatementTimeout } from "@/lib/db/guard";
import { notifications, sites } from "@/lib/db/schema";
import { measureDbQuery } from "@/lib/db/timing";
import { generateRequestId } from "@/lib/utils/requestId";

type DashboardSite = {
  id: number;
  siteId: string;
  name: string;
  location: string;
  status: "In Progress" | "Blocked" | "Completed";
  budget: string | null;
  currentProgress: number | null;
  currentPhase: string | null;
  supervisorId: string;
  updatedAt: Date;
};

type DashboardNotification = {
  id: string;
  title: string;
  message: string;
  type: string;
  readAt: string | null;
};

export type DashboardData = {
  user: SessionUser;
  role: SessionUser["role"];
  sites: DashboardSite[];
  archivedSites: DashboardSite[];
  notifications: {
    items: DashboardNotification[];
    total: number;
  };
};

export async function getDashboardData(
  user: SessionUser,
  requestId: string = generateRequestId()
): Promise<DashboardData> {
  const siteWhere =
    user.role === "Admin"
      ? and(isNull(sites.archivedAt), eq(sites.isDeleted, false))
      : and(
          eq(sites.supervisorId, user.id),
          isNull(sites.archivedAt),
          eq(sites.isDeleted, false)
        );

  // All reads run under a statement_timeout guard so an aborted dashboard request
  // cannot orphan an in-flight query and pin a pool slot. For admins, active +
  // archived sites come from ONE scan of `sites` (partitioned in JS) instead of two.
  const { allSiteRows, notificationRows } = await withStatementTimeout(async (tx) => {
    const sitesWhere =
      user.role === "Admin" ? eq(sites.isDeleted, false) : siteWhere;
    const [allSiteRows, notificationRows] = await Promise.all([
      measureDbQuery(requestId, "dashboard.sites", () =>
        tx.select().from(sites).where(sitesWhere).orderBy(desc(sites.updatedAt))
      ),
      measureDbQuery(requestId, "dashboard.notifications", () =>
        tx
          .select({
            id: notifications.notificationId,
            title: notifications.title,
            message: notifications.message,
            type: notifications.type,
            readAt: notifications.readAt,
          })
          .from(notifications)
          .where(eq(notifications.userId, user.id))
          .orderBy(desc(notifications.createdAt))
          .limit(20)
      ),
    ]);
    return { allSiteRows, notificationRows };
  });

  // Non-admins' `siteWhere` already excludes archived, so all their rows are active.
  const siteRows =
    user.role === "Admin" ? allSiteRows.filter((s) => s.archivedAt === null) : allSiteRows;
  const archivedRows =
    user.role === "Admin" ? allSiteRows.filter((s) => s.archivedAt !== null) : [];

  const unreadItems = notificationRows.filter((item) => item.readAt === null);

  return {
    user,
    role: user.role,
    sites: siteRows,
    archivedSites: archivedRows,
    notifications: {
      items: unreadItems.slice(0, 4).map((item) => ({
        ...item,
        readAt: item.readAt ? item.readAt.toISOString() : null,
      })),
      total: unreadItems.length,
    },
  };
}
