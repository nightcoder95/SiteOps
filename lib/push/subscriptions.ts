import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { pushSubscriptions } from "@/lib/db/schema";

export type SaveSubscriptionInput = {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
};

// Upsert by endpoint: a browser keeps the same endpoint across re-subscribes,
// and re-claiming it for the current user covers shared-device hand-off.
export async function saveSubscription(input: SaveSubscriptionInput) {
  await db
    .insert(pushSubscriptions)
    .values({
      userId: input.userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: input.userId, p256dh: input.p256dh, auth: input.auth },
    });
}

export async function deleteSubscription(userId: string, endpoint: string) {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}
