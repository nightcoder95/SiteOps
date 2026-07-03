import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE, GET, PATCH } from "./route";

const { mockRequireCapability, mockGetTool, mockUpdateTool, mockDeleteTool } = vi.hoisted(() => ({
  mockRequireCapability: vi.fn(),
  mockGetTool: vi.fn(),
  mockUpdateTool: vi.fn(),
  mockDeleteTool: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireCapability: mockRequireCapability }));
vi.mock("@/lib/tools/query", () => ({ getTool: mockGetTool }));
vi.mock("@/lib/tools/manage", () => ({
  updateTool: mockUpdateTool,
  deleteTool: mockDeleteTool,
  CategoryNotFound: class CategoryNotFound extends Error {},
}));
vi.mock("@/lib/utils/requestId", () => ({ generateRequestId: () => "req_test" }));

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function req(method: string, url = "http://localhost/api/tools/t1", body?: unknown) {
  return new NextRequest(url, {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}),
  });
}

describe("GET /api/tools/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireCapability.mockResolvedValue({ session: { user: { id: "u1", role: "Admin" } } });
  });

  it("404 when the tool does not exist", async () => {
    mockGetTool.mockResolvedValue(null);
    const res = await GET(req("GET"), ctx("t1"));
    expect(res.status).toBe(404);
  });

  it("returns the tool", async () => {
    mockGetTool.mockResolvedValue({ toolId: "t1", free: 3 });
    const res = await GET(req("GET"), ctx("t1"));
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/tools/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireCapability.mockResolvedValue({ session: { user: { id: "u1", role: "Admin" } } });
  });

  it("requires tool:manage", async () => {
    mockRequireCapability.mockResolvedValue({ error: "FORBIDDEN", status: 403 });
    const res = await PATCH(req("PATCH", "http://localhost/api/tools/t1", { name: "X" }), ctx("t1"));
    expect(res.status).toBe(403);
  });

  it("updates name (200)", async () => {
    mockUpdateTool.mockResolvedValue({ toolId: "t1", name: "X" });
    const res = await PATCH(req("PATCH", "http://localhost/api/tools/t1", { name: "X" }), ctx("t1"));
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/tools/:id", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireCapability.mockResolvedValue({ session: { user: { id: "u1", role: "Admin" } } });
  });

  it("requires tool:delete", async () => {
    mockRequireCapability.mockResolvedValue({ error: "FORBIDDEN", status: 403 });
    const res = await DELETE(req("DELETE"), ctx("t1"));
    expect(res.status).toBe(403);
  });

  it("409 when the tool has units deployed and not forced (case 7)", async () => {
    mockDeleteTool.mockResolvedValue({ ok: false, reason: "deployed" });
    const res = await DELETE(req("DELETE"), ctx("t1"));
    expect(res.status).toBe(409);
    expect(mockDeleteTool).toHaveBeenCalledWith({ toolId: "t1", force: false, actorUserId: "u1" });
  });

  it("passes force=true through to deleteTool", async () => {
    mockDeleteTool.mockResolvedValue({ ok: true });
    const res = await DELETE(req("DELETE", "http://localhost/api/tools/t1?force=true"), ctx("t1"));
    expect(res.status).toBe(200);
    expect(mockDeleteTool).toHaveBeenCalledWith({ toolId: "t1", force: true, actorUserId: "u1" });
  });
});
