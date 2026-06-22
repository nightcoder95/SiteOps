import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE } from "./route";

const { mockRequireCapability, mockSelect, mockDelete } = vi.hoisted(() => ({
  mockRequireCapability: vi.fn(),
  mockSelect: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireCapability: mockRequireCapability,
}));

vi.mock("@/lib/db/client", () => ({
  db: { select: mockSelect, delete: mockDelete },
}));

vi.mock("@/lib/cache/invalidate", () => ({
  invalidateCategoryTreeCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/nonCritical", () => ({
  runNonCritical: vi.fn(),
}));

vi.mock("@/lib/utils/requestId", () => ({
  generateRequestId: () => "req_test",
}));

// Sequences the chained db.select() reads in DELETE order:
// 1. subcategory row, 2. category name row, 3. usage count row.
function mockReads(subRows: unknown[], catRows: unknown[], countRows: unknown[]) {
  mockSelect
    .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve(subRows) }) }) })
    .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve(catRows) }) }) })
    .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve(countRows) }) });
}

function deleteReq() {
  return new NextRequest("http://localhost/api/forms/subcategories/s1", { method: "DELETE" });
}
const ctx = { params: Promise.resolve({ id: "s1" }) };

describe("DELETE subcategory usage guard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireCapability.mockResolvedValue({ session: { user: { id: "u1" } } });
    mockDelete.mockReturnValue({ where: () => Promise.resolve(undefined) });
  });

  it("blocks delete with 409 when the item is still in use", async () => {
    mockReads(
      [{ categoryId: "c1", name: "Cement" }],
      [{ name: "Materials" }],
      [{ n: 3 }],
    );

    const res = await DELETE(deleteReq(), ctx);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.message).toMatch(/deactivate/i);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("deletes when usage count is zero", async () => {
    mockReads(
      [{ categoryId: "c1", name: "Cement" }],
      [{ name: "Materials" }],
      [{ n: 0 }],
    );

    const res = await DELETE(deleteReq(), ctx);
    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalled();
  });

  it("deletes a subcategory whose category is not usage-tracked", async () => {
    mockReads([{ categoryId: "c1", name: "Whatever" }], [{ name: "Unmanaged" }], []);

    const res = await DELETE(deleteReq(), ctx);
    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalled();
  });

  it("returns 404 when the subcategory is missing", async () => {
    mockReads([], [], []);
    const res = await DELETE(deleteReq(), ctx);
    expect(res.status).toBe(404);
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
