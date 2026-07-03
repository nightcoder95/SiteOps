import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "./route";

const { mockRequireCapability, mockListCategories, mockCreateCategory } = vi.hoisted(() => ({
  mockRequireCapability: vi.fn(),
  mockListCategories: vi.fn(),
  mockCreateCategory: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireCapability: mockRequireCapability }));
vi.mock("@/lib/tools/categories", () => ({
  listCategories: mockListCategories,
  createCategory: mockCreateCategory,
}));
vi.mock("@/lib/utils/requestId", () => ({ generateRequestId: () => "req_test" }));

function getReq() {
  return new NextRequest("http://localhost/api/tools/categories", { method: "GET" });
}
function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/tools/categories", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("GET /api/tools/categories", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireCapability.mockResolvedValue({ session: { user: { id: "u1", role: "Admin" } } });
  });

  it("requires tool:read", async () => {
    mockRequireCapability.mockResolvedValue({ error: "FORBIDDEN", status: 403 });
    const res = await GET(getReq());
    expect(res.status).toBe(403);
  });

  it("lists categories", async () => {
    mockListCategories.mockResolvedValue([{ categoryId: "c1", codePrefix: "HND" }]);
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.categories).toHaveLength(1);
  });
});

describe("POST /api/tools/categories", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireCapability.mockResolvedValue({ session: { user: { id: "u1", role: "Admin" } } });
  });

  it("requires tool_category:manage", async () => {
    mockRequireCapability.mockResolvedValue({ error: "FORBIDDEN", status: 403 });
    const res = await POST(postReq({ name: "Hand Tool", codePrefix: "HND" }));
    expect(res.status).toBe(403);
    expect(mockRequireCapability).toHaveBeenCalledWith(expect.anything(), "tool_category:manage");
  });

  it("rejects an invalid prefix (400)", async () => {
    const res = await POST(postReq({ name: "X", codePrefix: "H-D" }));
    expect(res.status).toBe(400);
    expect(mockCreateCategory).not.toHaveBeenCalled();
  });

  it("creates a category (201) with uppercased prefix", async () => {
    mockCreateCategory.mockImplementation((v: { codePrefix: string }) => Promise.resolve({ categoryId: "c1", ...v }));
    const res = await POST(postReq({ name: "Hand Tool", codePrefix: "hnd" }));
    expect(res.status).toBe(201);
    expect(mockCreateCategory).toHaveBeenCalledWith(expect.objectContaining({ codePrefix: "HND" }));
  });
});
