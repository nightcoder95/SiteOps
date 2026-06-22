import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const { mockRequireCapability, mockSelect, mockExecute, mockUpdate } = vi.hoisted(() => ({
  mockRequireCapability: vi.fn(),
  mockSelect: vi.fn(),
  mockExecute: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireCapability: mockRequireCapability,
}));

vi.mock("@/lib/db/client", () => ({
  db: { select: mockSelect, execute: mockExecute, update: mockUpdate },
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

// 1st select: the two subcategory rows. 2nd select: category name row.
function mockReads(subRows: unknown[], catRows: unknown[]) {
  mockSelect
    .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve(subRows) }) })
    .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve(catRows) }) }) });
}

function postBody(body: unknown) {
  return new NextRequest("http://localhost/api/admin/catalog/merge", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/admin/catalog/merge", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireCapability.mockResolvedValue({ session: { user: { id: "u1" } } });
    mockExecute.mockResolvedValue(undefined);
    mockUpdate.mockReturnValue({ set: () => ({ where: () => Promise.resolve(undefined) }) });
  });

  it("rewrites entries from source name to target name and deactivates source", async () => {
    mockReads(
      [
        { subcategoryId: "src", categoryId: "c1", name: "painting" },
        { subcategoryId: "tgt", categoryId: "c1", name: "Paint" },
      ],
      [{ name: "Materials" }],
    );

    const res = await POST(postBody({ sourceId: "src", targetId: "tgt" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(expect.anything());
  });

  it("rejects merging an item into itself", async () => {
    const res = await POST(postBody({ sourceId: "x", targetId: "x" }));
    expect(res.status).toBe(400);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("404s when either id is missing", async () => {
    mockReads([{ subcategoryId: "src", categoryId: "c1", name: "painting" }], []);
    const res = await POST(postBody({ sourceId: "src", targetId: "tgt" }));
    expect(res.status).toBe(404);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("400s when the two items belong to different categories", async () => {
    mockReads(
      [
        { subcategoryId: "src", categoryId: "c1", name: "a" },
        { subcategoryId: "tgt", categoryId: "c2", name: "b" },
      ],
      [],
    );
    const res = await POST(postBody({ sourceId: "src", targetId: "tgt" }));
    expect(res.status).toBe(400);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("requires admin capability", async () => {
    mockRequireCapability.mockResolvedValue({ error: "FORBIDDEN", status: 403 });
    const res = await POST(postBody({ sourceId: "src", targetId: "tgt" }));
    expect(res.status).toBe(403);
  });

  it("skips entry rewrite for an unmanaged category but still deactivates source", async () => {
    mockReads(
      [
        { subcategoryId: "src", categoryId: "c1", name: "a" },
        { subcategoryId: "tgt", categoryId: "c1", name: "b" },
      ],
      [{ name: "Unmanaged" }],
    );
    const res = await POST(postBody({ sourceId: "src", targetId: "tgt" }));
    expect(res.status).toBe(200);
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalled();
  });
});
