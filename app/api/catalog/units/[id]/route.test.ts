import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PATCH } from "./route";

const { mockRequireCapability, mockSelect, mockUpdate } = vi.hoisted(() => ({
  mockRequireCapability: vi.fn(),
  mockSelect: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireCapability: mockRequireCapability,
}));

vi.mock("@/lib/db/client", () => ({
  db: { select: mockSelect, update: mockUpdate },
}));

vi.mock("@/lib/utils/requestId", () => ({
  generateRequestId: () => "req_test",
}));

// 1st select: the target unit row. 2nd select (only if renaming): all units for dup check.
function mockReads(unitRows: unknown[], allRows: unknown[] = []) {
  mockSelect
    .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve(unitRows) }) }) })
    .mockReturnValueOnce({ from: () => Promise.resolve(allRows) });
}

function patchReq(body: unknown) {
  return new NextRequest("http://localhost/api/catalog/units/u1", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
const ctx = { params: Promise.resolve({ id: "u1" }) };

describe("PATCH /api/catalog/units/[id]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireCapability.mockResolvedValue({ session: { user: { id: "u1" } } });
    let captured: Record<string, unknown> = {};
    mockUpdate.mockReturnValue({
      set: (v: Record<string, unknown>) => {
        captured = v;
        return { where: () => ({ returning: () => Promise.resolve([{ unitId: "u1", ...captured }]) }) };
      },
    });
  });

  it("renames a unit's label", async () => {
    mockReads([{ unitId: "u1", label: "Tonne", category: "Weight" }], [{ unitId: "u1", label: "Tonne" }]);
    const res = await PATCH(patchReq({ label: "Metric Tonne" }), ctx);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.label).toBe("Metric Tonne");
  });

  it("deactivates a unit", async () => {
    mockReads([{ unitId: "u1", label: "Tonne", category: "Weight" }]);
    const res = await PATCH(patchReq({ isActive: false }), ctx);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.isActive).toBe(false);
  });

  it("rejects a rename colliding with another unit", async () => {
    mockReads(
      [{ unitId: "u1", label: "Tonne", category: "Weight" }],
      [
        { unitId: "u1", label: "Tonne" },
        { unitId: "u2", label: "Litre" },
      ],
    );
    const res = await PATCH(patchReq({ label: " litre " }), ctx);
    expect(res.status).toBe(409);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("404s for an unknown unit", async () => {
    mockReads([]);
    const res = await PATCH(patchReq({ isActive: false }), ctx);
    expect(res.status).toBe(404);
  });

  it("rejects an empty payload", async () => {
    const res = await PATCH(patchReq({}), ctx);
    expect(res.status).toBe(400);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("requires admin capability", async () => {
    mockRequireCapability.mockResolvedValue({ error: "FORBIDDEN", status: 403 });
    const res = await PATCH(patchReq({ isActive: false }), ctx);
    expect(res.status).toBe(403);
  });
});
