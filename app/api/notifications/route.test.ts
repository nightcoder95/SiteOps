import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, PATCH } from "./route";

const {
  mockRequireAuth,
  mockGetNotificationsForUser,
  mockGetNotificationCountForUser,
  mockMarkAllNotificationsRead,
} = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockGetNotificationsForUser: vi.fn(),
  mockGetNotificationCountForUser: vi.fn(),
  mockMarkAllNotificationsRead: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireAuth: mockRequireAuth,
}));

vi.mock("@/lib/db/queries/notifications", () => ({
  getNotificationsForUser: mockGetNotificationsForUser,
  getNotificationCountForUser: mockGetNotificationCountForUser,
  markAllNotificationsRead: mockMarkAllNotificationsRead,
}));

vi.mock("@/lib/utils/requestId", () => ({
  generateRequestId: () => "req_test",
}));

describe("notifications route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET returns list envelope with items/total", async () => {
    mockRequireAuth.mockResolvedValue({
      session: { user: { id: "u1" } },
    });
    mockGetNotificationsForUser.mockResolvedValue([{ id: "n1" }]);
    mockGetNotificationCountForUser.mockResolvedValue(7);

    const req = new NextRequest("http://localhost/api/notifications?limit=50&offset=10");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      items: [{ id: "n1" }],
      total: 7,
      limit: 50,
      offset: 10,
    });
  });

  it("PATCH validates markAllRead payload", async () => {
    mockRequireAuth.mockResolvedValue({
      session: { user: { id: "u1" } },
    });

    const req = new NextRequest("http://localhost/api/notifications", {
      method: "PATCH",
      body: JSON.stringify({ markAllRead: false }),
      headers: { "content-type": "application/json" },
    });

    const res = await PATCH(req);
    expect(res.status).toBe(400);
    expect(mockMarkAllNotificationsRead).not.toHaveBeenCalled();
  });
});
