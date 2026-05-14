import { z } from "zod";

import { requireAuth } from "@/lib/auth/guards";
import {
  getNotificationCountForUser,
  getNotificationsForUser,
  markAllNotificationsRead,
} from "@/lib/db/queries/notifications";
import { measureDbQuery } from "@/lib/db/timing";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";

const markAllSchema = z.object({ markAllRead: z.literal(true) });

export const GET = withApi(async ({ request, requestId }) => {
  const auth = await requireAuth(request);
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }

  const { searchParams } = new URL(request.url);
  const rawLimit = Number(searchParams.get("limit") ?? "20");
  const rawOffset = Number(searchParams.get("offset") ?? "0");
  const unreadOnly = searchParams.get("unreadOnly") === "true";
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, rawLimit)) : 20;
  const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0;

  const [items, total] = await Promise.all([
    measureDbQuery(requestId, "notifications.list", () =>
      getNotificationsForUser(auth.session.user.id, { limit, offset, unreadOnly })
    ),
    measureDbQuery(requestId, "notifications.count", () =>
      getNotificationCountForUser(auth.session.user.id, { unreadOnly })
    ),
  ]);

  return successResponse({ items, total, limit, offset }, 200, requestId);
});

export const PATCH = withApi(async ({ request, requestId }) => {
  const auth = await requireAuth(request);
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
  }

  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return parsed.response;
  const validation = validateBody(markAllSchema, parsed.data, requestId);
  if (!validation.ok) return validation.response;

  await measureDbQuery(requestId, "notifications.mark_all_read", () =>
    markAllNotificationsRead(auth.session.user.id)
  );
  return successResponse(null, 200, requestId);
});
