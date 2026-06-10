import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PATCH } from "./route";

const { mockRequireCapability, mockReviewFieldRequest } = vi.hoisted(() => ({
  mockRequireCapability: vi.fn(),
  mockReviewFieldRequest: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireCapability: mockRequireCapability,
}));

vi.mock("@/lib/services/reviews", () => ({
  reviewFieldRequest: mockReviewFieldRequest,
}));

vi.mock("@/lib/db/client", () => ({
  db: {},
}));

vi.mock("@/lib/utils/requestId", () => ({
  generateRequestId: () => "req_test",
}));

describe("field request review route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCapability.mockResolvedValue({
      session: { user: { id: "admin-1", role: "Admin" } },
    });
  });

  it("returns not found when request is missing", async () => {
    mockReviewFieldRequest.mockResolvedValue({ type: "not_found" });

    const req = new NextRequest("http://localhost/api/requests/field/r1", {
      method: "PATCH",
      body: JSON.stringify({ status: "Approved" }),
      headers: { "content-type": "application/json" },
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(404);
  });

  it("returns success when review succeeds", async () => {
    mockReviewFieldRequest.mockResolvedValue({
      type: "ok",
      row: { id: "r1", status: "Approved" },
    });

    const req = new NextRequest("http://localhost/api/requests/field/r1", {
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
