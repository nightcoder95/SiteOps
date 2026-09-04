import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

// Characterisation test written BEFORE the F11 review-flow extraction. Every
// assertion here pins behaviour that exists today; if extraction changes any of
// it, the extraction is wrong.
const {
  mockRequireSiteAccess,
  mockSelect,
  mockInsert,
  mockRunNonCritical,
  mockGetAllAdmins,
  mockCreateNotification,
} = vi.hoisted(() => ({
  mockRequireSiteAccess: vi.fn(),
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockRunNonCritical: vi.fn(),
  mockGetAllAdmins: vi.fn(),
  mockCreateNotification: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireSiteAccess: mockRequireSiteAccess,
}));

vi.mock("@/lib/db/client", () => ({
  db: { select: mockSelect, insert: mockInsert },
}));

vi.mock("@/lib/db/queries/notifications", () => ({
  getAllAdmins: mockGetAllAdmins,
  createNotification: mockCreateNotification,
}));

vi.mock("@/lib/cache/invalidate", () => ({
  invalidateCategoryListCache: vi.fn().mockResolvedValue(undefined),
  invalidateCatalogOverviewCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/nonCritical", () => ({
  runNonCritical: mockRunNonCritical,
}));

vi.mock("@/lib/utils/requestId", () => ({
  generateRequestId: () => "req_test",
}));

const EXISTING = [{ categoryId: "c-existing", name: "Materials", icon: null }];

// db.select() is used twice in the POST path: the existing-categories read
// (no .where) and, inside resolveReviewSiteId, a site lookup (.where[.limit]).
function mockSelects(existing: unknown[], siteRows: unknown[]) {
  mockSelect.mockImplementation(() => ({
    from: () => {
      const rows = Promise.resolve(existing);
      return Object.assign(rows, {
        where: () =>
          Object.assign(Promise.resolve(siteRows), {
            limit: () => Promise.resolve(siteRows),
          }),
      });
    },
  }));
}

// Records every db.insert(table).values(rows) call as [tableMarker, rows].
function mockInserts(createdCategory: unknown) {
  const calls: Array<{ values: unknown }> = [];
  mockInsert.mockImplementation(() => ({
    values: (values: unknown) => {
      calls.push({ values });
      return {
        returning: () => Promise.resolve(createdCategory === null ? [] : [createdCategory]),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(undefined).then(resolve),
      };
    },
  }));
  return calls;
}

function postReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/forms/categories", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const CREATED = { categoryId: "c-new", name: "Scaffolding", icon: null };

describe("POST /api/forms/categories", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireSiteAccess.mockResolvedValue({
      session: { user: { id: "u1", role: "Admin" } },
    });
    mockGetAllAdmins.mockResolvedValue([{ id: "admin1" }, { id: "admin2" }]);
    mockCreateNotification.mockResolvedValue(undefined);
  });

  it("auto-approves a clearly novel name: 201, flaggedForReview false, no review row", async () => {
    mockSelects(EXISTING, []);
    const inserts = mockInserts(CREATED);

    const res = await POST(postReq({ name: "Scaffolding" }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.flaggedForReview).toBe(false);
    expect(body.data.categoryId).toBe("c-new");
    // only the category insert happened
    expect(inserts).toHaveLength(1);
    expect(mockGetAllAdmins).not.toHaveBeenCalled();
  });

  it("409s on a similar name unless the caller overrides", async () => {
    mockSelects(EXISTING, []);
    mockInserts(CREATED);

    const res = await POST(postReq({ name: "Material" }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.details.requiresReview).toBe(true);
    expect(body.error.details.candidates.length).toBeGreaterThan(0);
  });

  it("returns the existing row (200) for an exact duplicate", async () => {
    mockSelects(EXISTING, []);
    mockInserts(CREATED);

    const res = await POST(postReq({ name: "materials " }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.categoryId).toBe("c-existing");
  });

  it("review path: notifies admins and inserts one [Category Review] fieldRequest", async () => {
    mockSelects(EXISTING, [{ siteId: "site-1" }]);
    const inserts = mockInserts(CREATED);

    const res = await POST(postReq({ name: "Material", overrideDuplicateWarning: true }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.flaggedForReview).toBe(true);

    expect(mockRunNonCritical).toHaveBeenCalledWith(
      expect.any(String),
      "category_review_notification_failed",
      expect.anything(),
      expect.objectContaining({ categoryId: "c-new", name: "Material" }),
    );

    expect(inserts).toHaveLength(2);
    expect(inserts[1].values).toEqual({
      siteId: "site-1",
      proposedName: "[Category Review] Material",
      categoryId: "c-new",
      subcategoryId: null,
      fieldType: "Text",
      status: "Pending",
      requestedBy: "u1",
    });
  });

  it("review path with no resolvable site: no fieldRequest row, still 201", async () => {
    mockSelects(EXISTING, []);
    const inserts = mockInserts(CREATED);

    const res = await POST(postReq({ name: "Material", overrideDuplicateWarning: true }));

    expect(res.status).toBe(201);
    expect(inserts).toHaveLength(1);
  });

  it("customFields with a siteId produce one row each, unit appended when given", async () => {
    mockSelects(EXISTING, []);
    const inserts = mockInserts(CREATED);

    await POST(postReq({
      name: "Scaffolding",
      siteId: "550e8400-e29b-41d4-a716-446655440000",
      customFields: [
        { label: "Height", fieldType: "Number", unit: "m" },
        { label: "Notes", fieldType: "Text" },
        { label: "   ", fieldType: "Text" },
      ],
    }));

    expect(inserts).toHaveLength(2);
    const rows = inserts[1].values as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0].proposedName).toBe("Height (m)");
    expect(rows[1].proposedName).toBe("Notes");
    expect(rows.every((row) => row.status === "Pending")).toBe(true);
    expect(rows.every((row) => row.requestedBy === "u1")).toBe(true);
  });

  it("remarks with a siteId produce one 'Remarks: …' row", async () => {
    mockSelects(EXISTING, []);
    const inserts = mockInserts(CREATED);

    await POST(postReq({
      name: "Scaffolding",
      siteId: "550e8400-e29b-41d4-a716-446655440000",
      remarks: "  needs a crane  ",
    }));

    const rows = inserts[1].values as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].proposedName).toBe("Remarks: needs a crane");
    expect(rows[0].fieldType).toBe("Text");
  });

  it("without a siteId, neither customFields nor remarks produce rows", async () => {
    mockSelects(EXISTING, []);
    const inserts = mockInserts(CREATED);

    await POST(postReq({
      name: "Scaffolding",
      customFields: [{ label: "Height", fieldType: "Number" }],
      remarks: "hello",
    }));

    expect(inserts).toHaveLength(1);
  });

  it("500s when the insert returns nothing", async () => {
    mockSelects(EXISTING, []);
    mockInserts(null);

    const res = await POST(postReq({ name: "Scaffolding" }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error.message).toBe("Category creation failed");
  });

  it("rejects an unauthenticated caller with the guard's own code/status", async () => {
    mockRequireSiteAccess.mockResolvedValue({ error: "UNAUTHORIZED", status: 401 });

    const res = await POST(postReq({ name: "Scaffolding" }));

    expect(res.status).toBe(401);
  });
});
