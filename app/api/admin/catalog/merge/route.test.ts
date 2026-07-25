import { PgDialect } from "drizzle-orm/pg-core";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const { mockRequireCapability, mockSelect, mockExecute, mockUpdate, mockTransaction } = vi.hoisted(() => ({
  mockRequireCapability: vi.fn(),
  mockSelect: vi.fn(),
  mockExecute: vi.fn(),
  mockUpdate: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireCapability: mockRequireCapability,
}));

vi.mock("@/lib/db/client", () => ({
  db: { select: mockSelect, execute: mockExecute, update: mockUpdate, transaction: mockTransaction },
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
    // Route now wraps the rewrite in db.transaction(tx => ...); hand the callback
    // a tx that reuses the same execute/update spies so existing assertions hold.
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) =>
      cb({ execute: mockExecute, update: mockUpdate }),
    );
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

  it("rewrites entries across all sources for a multi-table category (Work Stage), in one transaction", async () => {
    // "Work Stage" maps to 4 tables (material/labour/machinery/expense) — the
    // merge must rewrite every one, not just the first, and do it atomically.
    mockReads(
      [
        { subcategoryId: "src", categoryId: "c1", name: "Basement Level" },
        { subcategoryId: "tgt", categoryId: "c1", name: "Basement" },
      ],
      [{ name: "Work Stage" }],
    );

    const res = await POST(postBody({ sourceId: "src", targetId: "tgt" }));

    expect(res.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledTimes(4);
  });

  it("renders the SET column unqualified so Postgres accepts the UPDATE", async () => {
    // Regression: interpolating the PgColumn into SET renders it as
    // "material_entries"."work_stage", which Postgres rejects with 42703
    // (column "material_entries" of relation "material_entries" does not
    // exist) -> the route 500s. Only the WHERE side may stay qualified.
    mockReads(
      [
        { subcategoryId: "src", categoryId: "c1", name: "Basement Level" },
        { subcategoryId: "tgt", categoryId: "c1", name: "Basement" },
      ],
      [{ name: "Materials" }],
    );

    const res = await POST(postBody({ sourceId: "src", targetId: "tgt" }));
    expect(res.status).toBe(200);

    const { sql: rendered } = new PgDialect().sqlToQuery(mockExecute.mock.calls[0][0]);
    expect(rendered).toContain(`set "material_type" =`);
    expect(rendered).not.toContain(`set "material_entries"."material_type"`);
    expect(rendered).toContain(`where "material_entries"."material_type" =`);
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
