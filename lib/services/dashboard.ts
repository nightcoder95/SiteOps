import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";

import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { notifications, sites } from "@/lib/db/schema";

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

export async function getDashboardData(user: SessionUser): Promise<DashboardData> {
  const siteWhere =
    user.role === "Admin"
      ? and(isNull(sites.archivedAt), eq(sites.isDeleted, false))
      : and(
          eq(sites.supervisorId, user.id),
          isNull(sites.archivedAt),
          eq(sites.isDeleted, false)
        );

  const [siteRows, archivedRows, notificationRows] = await Promise.all([
    db.select().from(sites).where(siteWhere).orderBy(desc(sites.updatedAt)),
    // Archived (but not permanently-deleted) sites — admin-only restore queue.
    user.role === "Admin"
      ? db
          .select()
          .from(sites)
          .where(and(isNotNull(sites.archivedAt), eq(sites.isDeleted, false)))
          .orderBy(desc(sites.updatedAt))
      : Promise.resolve([] as DashboardSite[]),
    db
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
      .limit(20),
  ]);

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
