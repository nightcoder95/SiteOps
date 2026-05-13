import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PATCH } from "./route";

const { mockRequireAdmin, mockReviewResourceRequest } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockReviewResourceRequest: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock("@/lib/services/reviews", () => ({
  reviewResourceRequest: mockReviewResourceRequest,
}));

vi.mock("@/lib/db/queries/notifications", () => ({
  createNotification: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/utils/requestId", () => ({
  generateRequestId: () => "req_test",
}));

describe("resource request review route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({
      session: { user: { id: "admin-1", role: "Admin" } },
    });
  });

  it("returns conflict for already reviewed request", async () => {
    mockReviewResourceRequest.mockResolvedValue({
      type: "conflict",
      row: { id: "r1", status: "Declined" },
    });

    const req = new NextRequest("http://localhost/api/requests/resource/r1", {
      method: "PATCH",
      body: JSON.stringify({ status: "Approved" }),
      headers: { "content-type": "application/json" },
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(409);
  });

  it("returns success for idempotent accepted transition", async () => {
    mockReviewResourceRequest.mockResolvedValue({
      type: "ok",
      row: { id: "r1", status: "Approved", requestedBy: "u1", siteId: "s1" },
    });

    const req = new NextRequest("http://localhost/api/requests/resource/r1", {
      method: "PATCH",
      body: JSON.stringify({ status: "Approved" }),
      headers: { "content-type": "application/json" },
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "r1" }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});
