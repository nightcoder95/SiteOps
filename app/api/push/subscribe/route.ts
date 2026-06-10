import { z } from "zod";

import { requireAuth } from "@/lib/auth/guards";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";
import { deleteSubscription, saveSubscription } from "@/lib/push/subscriptions";

// PWA6 — store/remove a browser's Web Push subscription for the current user.
const subscribeSchema = z.object({
  endpoint: z.string().url().max(1024),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(1024),
});

export const POST = withApi(async ({ request, requestId }) => {
  const auth = await requireAuth(request);
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }

  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return parsed.response;
  const validation = validateBody(subscribeSchema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  await saveSubscription({
    userId: auth.session.user.id,
    endpoint: validation.data.endpoint,
    p256dh: validation.data.keys.p256dh,
    auth: validation.data.keys.auth,
    userAgent: request.headers.get("user-agent")?.slice(0, 255) ?? null,
  });

  return successResponse(null, 201, requestId);
});

export const DELETE = withApi(async ({ request, requestId }) => {
  const auth = await requireAuth(request);
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }

  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return parsed.response;
  const validation = validateBody(unsubscribeSchema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  await deleteSubscription(auth.session.user.id, validation.data.endpoint);
  return successResponse(null, 200, requestId);
});
