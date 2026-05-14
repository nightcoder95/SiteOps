import { and, desc, eq, isNull } from "drizzle-orm";

import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { notifications, sites } from "@/lib/db/schema";

type DashboardNotification = {
  id: string;
  title: string;
  message: string;
  type: string;
  readAt: string | null;
};

export type DashboardData = {
  user: SessionUser;
  sites: Array<{
    id: number;
    siteId: string;
    name: string;
    location: string;
    status: "In Progress" | "Blocked" | "Completed";
    budget: string | null;
    currentProgress: number | null;
    currentPhase: string | null;
    supervisorId: string;
  }>;
  notifications: {
    items: DashboardNotification[];
    total: number;
  };
};

export async function getDashboardData(user: SessionUser): Promise<DashboardData> {
  const siteWhere =
    user.role === "Admin"
      ? isNull(sites.archivedAt)
      : and(eq(sites.supervisorId, user.id), isNull(sites.archivedAt));

  const [siteRows, notificationRows] = await Promise.all([
    db.select().from(sites).where(siteWhere),
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
    sites: siteRows,
    notifications: {
      items: unreadItems.slice(0, 4).map((item) => ({
        ...item,
        readAt: item.readAt ? item.readAt.toISOString() : null,
      })),
      total: unreadItems.length,
    },
  };
}
