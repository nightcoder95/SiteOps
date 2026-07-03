import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "./route";

const { mockRequireCapability, mockListTools, mockCreateTool } = vi.hoisted(() => ({
  mockRequireCapability: vi.fn(),
  mockListTools: vi.fn(),
  mockCreateTool: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireCapability: mockRequireCapability }));
vi.mock("@/lib/tools/query", () => ({ listTools: mockListTools }));
vi.mock("@/lib/tools/manage", () => ({
  createTool: mockCreateTool,
  CategoryNotFound: class CategoryNotFound extends Error {},
}));
vi.mock("@/lib/utils/requestId", () => ({ generateRequestId: () => "req_test" }));

function getReq(url = "http://localhost/api/tools") {
  return new NextRequest(url, { method: "GET" });
}
function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/tools", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("GET /api/tools", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireCapability.mockResolvedValue({ session: { user: { id: "u1", role: "Admin" } } });
  });

  it("requires tool:read", async () => {
    mockRequireCapability.mockResolvedValue({ error: "FORBIDDEN", status: 403 });
    const res = await GET(getReq());
    expect(res.status).toBe(403);
    expect(mockRequireCapability).toHaveBeenCalledWith(expect.anything(), "tool:read");
  });

  it("returns the tool list", async () => {
    mockListTools.mockResolvedValue([{ toolId: "t1", free: 5 }]);
    const res = await GET(getReq());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.tools).toHaveLength(1);
  });

  it("passes ?q= through to listTools", async () => {
    mockListTools.mockResolvedValue([]);
    await GET(getReq("http://localhost/api/tools?q=man"));
    expect(mockListTools).toHaveBeenCalledWith("man");
  });
});

describe("POST /api/tools", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireCapability.mockResolvedValue({ session: { user: { id: "u1", role: "Admin" } } });
  });

  it("requires tool:manage", async () => {
    mockRequireCapability.mockResolvedValue({ error: "FORBIDDEN", status: 403 });
    const res = await POST(postReq({ name: "X", categoryId: crypto.randomUUID() }));
    expect(res.status).toBe(403);
  });

  it("rejects an invalid body (400)", async () => {
    const res = await POST(postReq({ name: "" }));
    expect(res.status).toBe(400);
    expect(mockCreateTool).not.toHaveBeenCalled();
  });

  it("creates a tool (201)", async () => {
    mockCreateTool.mockResolvedValue({ toolId: "t1", code: "HND-001" });
    const res = await POST(postReq({ name: "Manvatti", categoryId: crypto.randomUUID(), openingStock: 5 }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.code).toBe("HND-001");
  });
});
