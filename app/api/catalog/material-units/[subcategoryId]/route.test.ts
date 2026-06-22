import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, PUT } from "./route";

const { mockRequireCapability, mockSelect, mockDelete, mockInsert } = vi.hoisted(() => ({
  mockRequireCapability: vi.fn(),
  mockSelect: vi.fn(),
  mockDelete: vi.fn(),
  mockInsert: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireCapability: mockRequireCapability,
}));

vi.mock("@/lib/db/client", () => ({
  db: { select: mockSelect, delete: mockDelete, insert: mockInsert },
}));

vi.mock("@/lib/utils/requestId", () => ({
  generateRequestId: () => "req_test",
}));

const ctx = { params: Promise.resolve({ subcategoryId: "s1" }) };

function getReq() {
  return new NextRequest("http://localhost/api/catalog/material-units/s1", { method: "GET" });
}
function putReq(body: unknown) {
  return new NextRequest("http://localhost/api/catalog/material-units/s1", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("GET /api/catalog/material-units/[subcategoryId]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireCapability.mockResolvedValue({ session: { user: { id: "u1" } } });
  });

  it("returns current mappings and the active unit list", async () => {
    mockSelect
      .mockReturnValueOnce({
        from: () => ({ innerJoin: () => ({ where: () => Promise.resolve([{ unitId: "u1", label: "Bag", isDefault: true }]) }) }),
      })
      .mockReturnValueOnce({
        from: () => ({ where: () => Promise.resolve([{ unitId: "u1", label: "Bag" }, { unitId: "u2", label: "KG" }]) }),
      });

    const res = await GET(getReq(), ctx);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.mappings).toEqual([{ unitId: "u1", label: "Bag", isDefault: true }]);
    expect(body.data.activeUnits).toHaveLength(2);
  });
});

describe("PUT /api/catalog/material-units/[subcategoryId]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireCapability.mockResolvedValue({ session: { user: { id: "u1" } } });
    mockDelete.mockReturnValue({ where: () => Promise.resolve(undefined) });
    mockInsert.mockReturnValue({ values: () => Promise.resolve(undefined) });
  });

  it("replaces mappings, marking the chosen default", async () => {
    let inserted: Array<Record<string, unknown>> = [];
    mockInsert.mockReturnValue({
      values: (rows: Array<Record<string, unknown>>) => {
        inserted = rows;
        return Promise.resolve(undefined);
      },
    });

    const res = await PUT(putReq({ unitIds: ["u1", "u2"], defaultUnitId: "u2" }), ctx);
    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalled();
    expect(inserted).toEqual([
      { subcategoryId: "s1", unitId: "u1", isDefault: false },
      { subcategoryId: "s1", unitId: "u2", isDefault: true },
    ]);
  });

  it("clears the mapping when unitIds is empty (no insert)", async () => {
    const res = await PUT(putReq({ unitIds: [] }), ctx);
    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects a default that is not among the chosen units", async () => {
    const res = await PUT(putReq({ unitIds: ["u1"], defaultUnitId: "u9" }), ctx);
    expect(res.status).toBe(400);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("requires admin capability", async () => {
    mockRequireCapability.mockResolvedValue({ error: "FORBIDDEN", status: 403 });
    const res = await PUT(putReq({ unitIds: [] }), ctx);
    expect(res.status).toBe(403);
  });
});
