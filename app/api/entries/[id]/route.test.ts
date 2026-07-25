import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireCapability, mockCheckOwnership, mockFindSite,
  mockGetEntryById, mockUpdateEntryById, mockDeleteEntryById, mockAssertCatalog,
} = vi.hoisted(() => ({
  mockRequireCapability: vi.fn(),
  mockCheckOwnership: vi.fn(),
  mockFindSite: vi.fn(),
  mockGetEntryById: vi.fn(),
  mockUpdateEntryById: vi.fn(),
  mockDeleteEntryById: vi.fn(),
  mockAssertCatalog: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireCapability: mockRequireCapability }));
vi.mock("@/lib/auth/ownership", () => ({ checkOwnership: mockCheckOwnership }));
vi.mock("@/lib/db/client", () => ({
  db: {
    query: { sites: { findFirst: mockFindSite } },
    select: () => ({ from: () => ({ where: async () => [] }) }),
  },
}));
vi.mock("@/lib/db/queries/entries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/queries/entries")>(
    "@/lib/db/queries/entries",
  );
  return {
    ...actual,
    getEntryById: mockGetEntryById,
    updateEntryById: mockUpdateEntryById,
    deleteEntryById: mockDeleteEntryById,
  };
});
vi.mock("@/lib/cache/invalidate", () => ({ invalidateAdminAnalyticsCache: vi.fn() }));
vi.mock("@/lib/services/nonCritical", () => ({ runNonCritical: vi.fn() }));
vi.mock("@/lib/validation/catalogList", () => ({ assertInCatalogList: mockAssertCatalog }));

import { PATCH } from "./route";

function reqType(type: string, body: unknown) {
  return new NextRequest(`http://localhost/api/entries/some-id?type=${type}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ id: "some-id" }) };

describe("PATCH entries — workStage catalog checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCapability.mockResolvedValue({ session: { user: { id: "u1", role: "supervisor" } } });
    mockCheckOwnership.mockReturnValue(true);
    mockFindSite.mockResolvedValue({ archivedAt: null });
    mockAssertCatalog.mockResolvedValue({ ok: true, value: "Roof Level" });
    mockUpdateEntryById.mockImplementation(async (_id: string, _type: string, data: unknown) => data);
  });

  it("PATCH labour with workStage string canonicalises via assertInCatalogList", async () => {
    mockGetEntryById.mockResolvedValue({ siteId: "s1", createdBy: "u1", workType: "Mason" });
    const res = await PATCH(reqType("labour", { workStage: "roof level" }), ctx);
    expect(res.status).toBe(200);
    expect(mockAssertCatalog).toHaveBeenCalledWith("Work Stage", "roof level");
    expect(mockUpdateEntryById).toHaveBeenCalledWith("some-id", "labour", expect.objectContaining({ workStage: "Roof Level" }));
  });

  it("PATCH labour with workStage: null skips the catalog check (un-tag)", async () => {
    mockGetEntryById.mockResolvedValue({ siteId: "s1", createdBy: "u1", workType: "Mason" });
    const res = await PATCH(reqType("labour", { workStage: null }), ctx);
    expect(res.status).toBe(200);
    expect(mockAssertCatalog).not.toHaveBeenCalled();
    expect(mockUpdateEntryById).toHaveBeenCalledWith("some-id", "labour", expect.objectContaining({ workStage: null }));
  });

  it("PATCH machinery with workStage: null skips the catalog check (un-tag)", async () => {
    mockGetEntryById.mockResolvedValue({ siteId: "s1", createdBy: "u1" });
    const res = await PATCH(reqType("machinery", { workStage: null }), ctx);
    expect(res.status).toBe(200);
    expect(mockAssertCatalog).not.toHaveBeenCalled();
    expect(mockUpdateEntryById).toHaveBeenCalledWith("some-id", "machinery", expect.objectContaining({ workStage: null }));
  });

  it("PATCH expense with workStage: null skips the catalog check (un-tag)", async () => {
    mockGetEntryById.mockResolvedValue({ siteId: "s1", createdBy: "u1" });
    const res = await PATCH(reqType("expense", { workStage: null }), ctx);
    expect(res.status).toBe(200);
    expect(mockAssertCatalog).not.toHaveBeenCalled();
    expect(mockUpdateEntryById).toHaveBeenCalledWith("some-id", "expense", expect.objectContaining({ workStage: null }));
  });
});
