import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireCapability, mockApplyRateLimit } = vi.hoisted(() => ({
  mockRequireCapability: vi.fn(),
  mockApplyRateLimit: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireCapability: mockRequireCapability }));
vi.mock("@/lib/rateLimit/guard", () => ({ applyRateLimit: mockApplyRateLimit }));

import { ERROR_CODES } from "@/lib/errors/codes";
import { successResponse } from "@/lib/errors/response";
import { withAuthedApi, withAuthedApiRoute } from "./withApi";

function req() {
  return new NextRequest("http://localhost/api/whatever");
}

async function body(res: Response) {
  return (await res.json()) as { data?: unknown; error?: { code: string; message: string } };
}

describe("withAuthedApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCapability.mockResolvedValue({ session: { user: { id: "u1", role: "Admin" } } });
    mockApplyRateLimit.mockResolvedValue(null);
  });

  it("invokes the handler with the session and returns its response untouched", async () => {
    const handler = vi.fn(async ({ session, requestId }: { session: { user: { id: string } }; requestId: string }) =>
      successResponse({ userId: session.user.id }, 200, requestId),
    );
    const route = withAuthedApi("site:read_all", handler);

    const res = await route(req());
    expect(res.status).toBe(200);
    expect((await body(res)).data).toEqual({ userId: "u1" });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(mockRequireCapability).toHaveBeenCalledWith(expect.anything(), "site:read_all");
  });

  it("never invokes the handler when the guard fails, and keeps its code and status", async () => {
    mockRequireCapability.mockResolvedValue({ error: ERROR_CODES.FORBIDDEN, status: 403 });
    const handler = vi.fn();
    const route = withAuthedApi("site:read_all", handler);

    const res = await route(req());
    expect(res.status).toBe(403);
    const parsed = await body(res);
    expect(parsed.error?.code).toBe(ERROR_CODES.FORBIDDEN);
    expect(parsed.error?.message).toBe("Authentication required");
    expect(handler).not.toHaveBeenCalled();
  });

  it("uses an unauthorizedMessage override verbatim", async () => {
    mockRequireCapability.mockResolvedValue({ error: ERROR_CODES.FORBIDDEN, status: 403 });
    const route = withAuthedApi("site:read_all", async () => successResponse(null, 200, "x"), {
      unauthorizedMessage: "Admin access required",
    });

    const res = await route(req());
    expect((await body(res)).error?.message).toBe("Admin access required");
  });

  it("still runs inside withApi: rate limiting applies and x-request-id is set", async () => {
    // Load-bearing: if the wrapper bypassed withApi, every converted route would
    // silently lose rate limiting and request-id logging.
    const route = withAuthedApi("site:read_all", async ({ requestId }) =>
      successResponse(null, 200, requestId),
    );
    const res = await route(req());
    expect(mockApplyRateLimit).toHaveBeenCalledTimes(1);
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("returns the rate limiter's response without invoking the guard's handler", async () => {
    mockApplyRateLimit.mockResolvedValue(
      new Response(JSON.stringify({ success: false }), { status: 429 }),
    );
    const handler = vi.fn();
    const route = withAuthedApi("site:read_all", handler);

    const res = await route(req());
    expect(res.status).toBe(429);
    expect(handler).not.toHaveBeenCalled();
  });

  it("produces withApi's standard 500 envelope when the handler throws", async () => {
    const route = withAuthedApi("site:read_all", async () => {
      throw new Error("boom");
    });
    const res = await route(req());
    expect(res.status).toBe(500);
    const parsed = await body(res);
    expect(parsed.error?.code).toBe(ERROR_CODES.INTERNAL_ERROR);
    expect(parsed.error?.message).toBe("An unexpected error occurred");
  });
});

describe("withAuthedApiRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCapability.mockResolvedValue({ session: { user: { id: "u1", role: "Admin" } } });
    mockApplyRateLimit.mockResolvedValue(null);
  });

  it("passes the dynamic-segment ctx through to the handler", async () => {
    const route = withAuthedApiRoute<{ params: Promise<{ id: string }> }>(
      "site:read_all",
      async ({ requestId }, ctx) => successResponse({ id: (await ctx.params).id }, 200, requestId),
    );
    const res = await route(req(), { params: Promise.resolve({ id: "abc" }) });
    expect((await body(res)).data).toEqual({ id: "abc" });
  });

  it("rejects before the handler when the guard fails", async () => {
    mockRequireCapability.mockResolvedValue({ error: ERROR_CODES.UNAUTHORIZED, status: 401 });
    const handler = vi.fn();
    const route = withAuthedApiRoute<{ params: Promise<{ id: string }> }>("site:read_all", handler);
    const res = await route(req(), { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });
});
