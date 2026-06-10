import "server-only";

import webpush from "web-push";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { pushSubscriptions } from "@/lib/db/schema";

// PWA6 — server-side Web Push sender. VAPID keys are required: generate once
// with `npx web-push generate-vapid-keys` and set:
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY  (also read by the client opt-in)
//   VAPID_PRIVATE_KEY
//   VAPID_SUBJECT                 (a mailto: or https: contact URL)
// Push is a best-effort enhancement: if keys are absent we no-op silently so the
// notifications domain keeps working without it.

let configured: boolean | null = null;

function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:ops@siteops.app";
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

// Sends a push to every device the user has subscribed. Subscriptions that the
// push service reports as gone (404/410) are pruned so the table stays clean.
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint));
        }
        // Other errors (network, 5xx) are swallowed — push is best-effort.
      }
    }),
  );
}
