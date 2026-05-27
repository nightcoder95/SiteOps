import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { notifications, userProfiles } from "@/lib/db/schema";

export async function createNotification(
  userId: string,
  type: "approval" | "budget_alert" | "incident" | "system",
  title: string,
  message: string,
  linkToView?: string
) {
  const result = await db
    .insert(notifications)
    .values({
      userId,
      type,
      title,
      message,
      linkToView: linkToView ?? null,
    })
    .returning();

  return result[0];
}

export async function getNotificationsForUser(
  userId: string,
  opts?: { limit?: number; offset?: number; unreadOnly?: boolean }
) {
  const limit = opts?.limit ?? 20;
  const offset = opts?.offset ?? 0;

  const where = opts?.unreadOnly
    ? and(eq(notifications.userId, userId), isNull(notifications.readAt))
    : eq(notifications.userId, userId);

  return db
    .select()
    .from(notifications)
    .where(where)
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getNotificationCountForUser(
  userId: string,
  opts?: { unreadOnly?: boolean }
) {
  const where = opts?.unreadOnly
    ? and(eq(notifications.userId, userId), isNull(notifications.readAt))
    : eq(notifications.userId, userId);

  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(where);

  return result[0]?.count ?? 0;
}

export async function markNotificationRead(id: string, userId: string) {
  const result = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.notificationId, id), eq(notifications.userId, userId)))
    .returning();

  return result[0] ?? null;
}

export async function markAllNotificationsRead(userId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));

  return true;
}

export async function getAllAdmins() {
  return db
    .select({ id: userProfiles.userId })
    .from(userProfiles)
    .where(eq(userProfiles.role, "Admin"));
}
