import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const { mockRequireCapability, mockApplyOneTool, mockGetTool, ToolNotFound } = vi.hoisted(() => ({
  mockRequireCapability: vi.fn(),
  mockApplyOneTool: vi.fn(),
  mockGetTool: vi.fn(),
  ToolNotFound: class ToolNotFound extends Error {
    constructor(public readonly toolId: string) {
      super("not found");
    }
  },
}));

vi.mock("@/lib/auth/guards", () => ({ requireCapability: mockRequireCapability }));
vi.mock("@/lib/tools/applyBatch", () => ({ applyOneTool: mockApplyOneTool, ToolNotFound }));
vi.mock("@/lib/tools/query", () => ({ getTool: mockGetTool }));
vi.mock("@/lib/utils/requestId", () => ({ generateRequestId: () => "req_test" }));

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/tools/batch-save", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/tools/batch-save", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireCapability.mockResolvedValue({ session: { user: { id: "u1", role: "Admin" } } });
  });

  it("requires tool:assign", async () => {
    mockRequireCapability.mockResolvedValue({ error: "FORBIDDEN", status: 403 });
    const res = await POST(postReq({ tools: [] }));
    expect(res.status).toBe(403);
    expect(mockRequireCapability).toHaveBeenCalledWith(expect.anything(), "tool:assign");
  });

  it("rejects an oversized payload (case 12) → 400", async () => {
    const tools = Array.from({ length: 201 }, () => ({ toolId: crypto.randomUUID(), version: 0 }));
    const res = await POST(postReq({ tools }));
    expect(res.status).toBe(400);
    expect(mockApplyOneTool).not.toHaveBeenCalled();
  });

  it("returns 200 with empty results for an empty batch (case 20)", async () => {
    const res = await POST(postReq({ tools: [] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.results).toEqual([]);
  });

  it("processes tools sequentially and returns mixed ok/conflict/invalid; good ones survive", async () => {
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    const c = crypto.randomUUID();
    mockApplyOneTool
      .mockResolvedValueOnce({ toolId: a, status: "ok", tool: { toolId: a, version: 2 } })
      .mockResolvedValueOnce({ toolId: b, status: "conflict", tool: { toolId: b, version: 5 } })
      .mockResolvedValueOnce({ toolId: c, status: "invalid", reason: "sum_exceeds_total", tool: { toolId: c } });

    const res = await POST(
      postReq({
        tools: [
          { toolId: a, version: 1, assignments: [{ siteId: crypto.randomUUID(), qty: 3 }] },
          { toolId: b, version: 1, totalQuantity: 9 },
          { toolId: c, version: 1, assignments: [{ siteId: crypto.randomUUID(), qty: 99 }] },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.results.map((r: { status: string }) => r.status)).toEqual(["ok", "conflict", "invalid"]);
    expect(mockApplyOneTool).toHaveBeenCalledTimes(3);
  });

  it("maps ToolNotFound to a per-tool invalid:not_found without failing the batch", async () => {
    const a = crypto.randomUUID();
    mockApplyOneTool.mockRejectedValueOnce(new ToolNotFound(a));
    mockGetTool.mockResolvedValue(null);
    const res = await POST(postReq({ tools: [{ toolId: a, version: 0 }] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.results[0]).toMatchObject({ status: "invalid", reason: "not_found" });
  });
});
