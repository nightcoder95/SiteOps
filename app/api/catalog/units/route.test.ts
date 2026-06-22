import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "./route";

const { mockRequireCapability, mockSelect, mockInsert } = vi.hoisted(() => ({
  mockRequireCapability: vi.fn(),
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireCapability: mockRequireCapability,
}));

vi.mock("@/lib/db/client", () => ({
  db: { select: mockSelect, insert: mockInsert },
}));

vi.mock("@/lib/utils/requestId", () => ({
  generateRequestId: () => "req_test",
}));

function getReq() {
  return new NextRequest("http://localhost/api/catalog/units", { method: "GET" });
}
function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/catalog/units", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("GET /api/catalog/units", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireCapability.mockResolvedValue({ session: { user: { id: "u1" } } });
  });

  it("returns units grouped by category with usage counts", async () => {
    mockSelect
      .mockReturnValueOnce({
        from: () =>
          Promise.resolve([
            { unitId: "1", label: "Tonne", category: "Weight", sortOrder: 0, isActive: true },
            { unitId: "2", label: "Litre", category: "Volume", sortOrder: 0, isActive: true },
          ]),
      })
      .mockReturnValueOnce({
        from: () => ({ groupBy: () => Promise.resolve([{ value: "Tonne", n: 4 }]) }),
      });

    const res = await GET(getReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    const groups = body.data.groups as Array<{ category: string; units: Array<{ label: string; usageCount: number }> }>;
    expect(groups.map((g) => g.category)).toEqual(["Volume", "Weight"]);
    const tonne = groups.find((g) => g.category === "Weight")!.units[0];
    expect(tonne.usageCount).toBe(4);
  });

  it("requires admin capability", async () => {
    mockRequireCapability.mockResolvedValue({ error: "FORBIDDEN", status: 403 });
    const res = await GET(getReq());
    expect(res.status).toBe(403);
  });
});

describe("POST /api/catalog/units", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireCapability.mockResolvedValue({ session: { user: { id: "u1" } } });
    mockInsert.mockReturnValue({
      values: () => ({ returning: () => Promise.resolve([{ unitId: "new", label: "Furlong" }]) }),
    });
  });

  function mockExisting(rows: unknown[]) {
    mockSelect.mockReturnValue({ from: () => Promise.resolve(rows) });
  }

  it("creates a unit with derived code and sortOrder = max+1 in its category", async () => {
    mockExisting([{ label: "Metre", category: "Length", sortOrder: 3 }]);
    let captured: Record<string, unknown> = {};
    mockInsert.mockReturnValue({
      values: (v: Record<string, unknown>) => {
        captured = v;
        return { returning: () => Promise.resolve([{ unitId: "new", ...v }]) };
      },
    });

    const res = await POST(postReq({ label: "Furlong", category: "Length" }));
    expect(res.status).toBe(201);
    expect(captured.code).toBe("FURLONG");
    expect(captured.sortOrder).toBe(4);
    expect(captured.isActive).toBe(true);
  });

  it("rejects a label that duplicates an existing unit (case-insensitive)", async () => {
    mockExisting([{ label: "Tonne", category: "Weight", sortOrder: 0 }]);
    const res = await POST(postReq({ label: " tonne ", category: "Weight" }));
    expect(res.status).toBe(409);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects an empty label", async () => {
    const res = await POST(postReq({ label: "   ", category: "Weight" }));
    expect(res.status).toBe(400);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("rejects a label with no alphanumerics (no derivable code)", async () => {
    mockExisting([]);
    const res = await POST(postReq({ label: "!!!", category: "Weight" }));
    expect(res.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("requires create capability", async () => {
    mockRequireCapability.mockResolvedValue({ error: "FORBIDDEN", status: 403 });
    const res = await POST(postReq({ label: "Furlong", category: "Length" }));
    expect(res.status).toBe(403);
  });
});
