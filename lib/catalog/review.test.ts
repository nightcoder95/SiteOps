import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSelect, mockInsert, mockRunNonCritical, mockGetAllAdmins, mockCreateNotification } =
  vi.hoisted(() => ({
    mockSelect: vi.fn(),
    mockInsert: vi.fn(),
    mockRunNonCritical: vi.fn(),
    mockGetAllAdmins: vi.fn(),
    mockCreateNotification: vi.fn(),
  }));

vi.mock("@/lib/db/client", () => ({
  db: { select: mockSelect, insert: mockInsert },
}));

vi.mock("@/lib/db/queries/notifications", () => ({
  getAllAdmins: mockGetAllAdmins,
  createNotification: mockCreateNotification,
}));

vi.mock("@/lib/services/nonCritical", () => ({
  runNonCritical: mockRunNonCritical,
}));

const {
  buildFieldRequestRows,
  checkSimilarNames,
  resolveReviewSiteId,
  submitForReview,
  SIMILARITY_REVIEW_THRESHOLD,
} = await import("./review");

// resolveReviewSiteId issues either one query (preferred site hit) or two
// (preferred miss, then the fallback scan). Each call returns the next batch.
function mockSiteQueries(...batches: unknown[][]) {
  let call = 0;
  mockSelect.mockImplementation(() => ({
    from: () => ({
      where: () => {
        const rows = batches[call] ?? [];
        call += 1;
        return Object.assign(Promise.resolve(rows), { limit: () => Promise.resolve(rows) });
      },
    }),
  }));
}

function mockInserts() {
  const calls: unknown[] = [];
  mockInsert.mockImplementation(() => ({
    values: (values: unknown) => {
      calls.push(values);
      return Promise.resolve(undefined);
    },
  }));
  return calls;
}

beforeEach(() => {
  vi.resetAllMocks();
  mockGetAllAdmins.mockResolvedValue([{ id: "admin1" }, { id: "admin2" }]);
  mockCreateNotification.mockResolvedValue(undefined);
});

describe("resolveReviewSiteId", () => {
  it("returns the preferred site when it exists and is active", async () => {
    mockSiteQueries([{ siteId: "site-pref" }]);
    expect(await resolveReviewSiteId("site-pref", "u1", "Admin")).toBe("site-pref");
  });

  it("falls through when the preferred site is archived or missing", async () => {
    mockSiteQueries([], [{ siteId: "site-fallback" }]);
    expect(await resolveReviewSiteId("site-archived", "u1", "Admin")).toBe("site-fallback");
  });

  it("with no preferred site, an Admin gets the first active site", async () => {
    mockSiteQueries([{ siteId: "site-any" }]);
    expect(await resolveReviewSiteId(undefined, "u1", "Admin")).toBe("site-any");
  });

  it("with no preferred site, a Supervisor gets one they supervise", async () => {
    mockSiteQueries([{ siteId: "site-mine" }]);
    expect(await resolveReviewSiteId(undefined, "u1", "Supervisor")).toBe("site-mine");
  });

  it("returns null when nothing matches", async () => {
    mockSiteQueries([], []);
    expect(await resolveReviewSiteId("nope", "u1", "Supervisor")).toBeNull();
  });
});

describe("buildFieldRequestRows", () => {
  const base = {
    siteId: "site-1",
    categoryId: "cat-1",
    subcategoryId: null,
    requestedBy: "u1",
  };

  it("appends the unit to the proposed name when one is given", () => {
    const rows = buildFieldRequestRows({
      ...base,
      customFields: [{ label: "Height", fieldType: "Number", unit: "m" }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].proposedName).toBe("Height (m)");
    expect(rows[0].fieldType).toBe("Number");
  });

  it("uses the bare label when no unit is given", () => {
    const rows = buildFieldRequestRows({
      ...base,
      customFields: [{ label: " Notes ", fieldType: "Text" }],
    });
    expect(rows[0].proposedName).toBe("Notes");
  });

  it("filters out blank labels", () => {
    const rows = buildFieldRequestRows({
      ...base,
      customFields: [{ label: "   ", fieldType: "Text" }],
    });
    expect(rows).toEqual([]);
  });

  it("turns remarks into a single 'Remarks: …' Text row", () => {
    const rows = buildFieldRequestRows({ ...base, remarks: "  needs a crane " });
    expect(rows).toHaveLength(1);
    expect(rows[0].proposedName).toBe("Remarks: needs a crane");
    expect(rows[0].fieldType).toBe("Text");
  });

  it("returns nothing when there are neither custom fields nor remarks", () => {
    expect(buildFieldRequestRows(base)).toEqual([]);
  });

  it("stamps every row with Pending and the passed ids", () => {
    const rows = buildFieldRequestRows({
      ...base,
      subcategoryId: "sub-1",
      customFields: [{ label: "Height", fieldType: "Number" }],
      remarks: "hi",
    });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.status).toBe("Pending");
      expect(row.siteId).toBe("site-1");
      expect(row.categoryId).toBe("cat-1");
      expect(row.subcategoryId).toBe("sub-1");
      expect(row.requestedBy).toBe("u1");
    }
  });
});

describe("submitForReview", () => {
  const base = {
    requestId: "req_test",
    name: "Material",
    categoryId: "cat-1",
    subcategoryId: null,
    preferredSiteId: undefined,
    sessionUserId: "u1",
    role: "Admin" as const,
  };

  it("notifies admins and inserts a [Category Review] row for a category", async () => {
    mockSiteQueries([{ siteId: "site-1" }]);
    const inserts = mockInserts();

    await submitForReview({ ...base, noun: "category" });

    expect(mockRunNonCritical).toHaveBeenCalledWith(
      "req_test",
      "category_review_notification_failed",
      expect.anything(),
      { categoryId: "cat-1", name: "Material" },
    );
    expect(mockCreateNotification).toHaveBeenCalledWith(
      "admin1",
      "approval",
      "Category needs review",
      'A similar category "Material" was created and flagged for admin review.',
      "/app/logs/new",
    );
    expect(inserts).toEqual([{
      siteId: "site-1",
      proposedName: "[Category Review] Material",
      categoryId: "cat-1",
      subcategoryId: null,
      fieldType: "Text",
      status: "Pending",
      requestedBy: "u1",
    }]);
  });

  it("uses the subcategory copy, event name and meta for a subcategory", async () => {
    mockSiteQueries([{ siteId: "site-1" }]);
    const inserts = mockInserts();

    await submitForReview({
      ...base,
      noun: "subcategory",
      subcategoryId: "sub-1",
      preferredSiteId: "site-1",
    });

    expect(mockRunNonCritical).toHaveBeenCalledWith(
      "req_test",
      "subcategory_review_notification_failed",
      expect.anything(),
      { categoryId: "cat-1", subcategoryId: "sub-1", name: "Material" },
    );
    expect(mockCreateNotification).toHaveBeenCalledWith(
      "admin1",
      "approval",
      "Subcategory needs review",
      'A similar subcategory "Material" was created and flagged for admin review.',
      "/app/sites/site-1",
    );
    // The review row carries subcategoryId: null for BOTH nouns — current
    // behaviour, deliberately preserved.
    expect(inserts).toEqual([{
      siteId: "site-1",
      proposedName: "[Subcategory Review] Material",
      categoryId: "cat-1",
      subcategoryId: null,
      fieldType: "Text",
      status: "Pending",
      requestedBy: "u1",
    }]);
  });

  it("inserts nothing and does not throw when no review site resolves", async () => {
    mockSiteQueries([], []);
    const inserts = mockInserts();

    await expect(submitForReview({ ...base, noun: "category" })).resolves.toBeUndefined();
    expect(inserts).toEqual([]);
  });
});

describe("checkSimilarNames", () => {
  const existing = [
    { id: "c1", name: "Materials" },
    { id: "c2", name: "Machinery" },
  ];

  it("flags an exact match for review", () => {
    const result = checkSimilarNames("Materials", existing);
    expect(result.requiresReview).toBe(true);
    expect(result.topScore).toBeGreaterThanOrEqual(SIMILARITY_REVIEW_THRESHOLD);
    expect(result.candidates[0].id).toBe("c1");
  });

  it("flags a near match above the threshold", () => {
    expect(checkSimilarNames("Material", existing).requiresReview).toBe(true);
  });

  it("does not flag an unrelated name", () => {
    const result = checkSimilarNames("Scaffolding", existing);
    expect(result.requiresReview).toBe(false);
    expect(result.topScore).toBeLessThan(SIMILARITY_REVIEW_THRESHOLD);
  });

  it("handles an empty candidate list", () => {
    const result = checkSimilarNames("Anything", []);
    expect(result.requiresReview).toBe(false);
    expect(result.candidates).toEqual([]);
  });
});
