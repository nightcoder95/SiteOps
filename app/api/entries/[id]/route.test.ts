import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireCapability, mockCheckOwnership, mockFindSite,
  mockGetEntryById, mockUpdateEntryById, mockDeleteEntryById, mockAssertCatalog,
  mockUnitRuleFor, mockSelectWhere,
} = vi.hoisted(() => ({
  mockRequireCapability: vi.fn(),
  mockCheckOwnership: vi.fn(),
  mockFindSite: vi.fn(),
  mockGetEntryById: vi.fn(),
  mockUpdateEntryById: vi.fn(),
  mockDeleteEntryById: vi.fn(),
  mockAssertCatalog: vi.fn(),
  mockUnitRuleFor: vi.fn(),
  mockSelectWhere: vi.fn(async () => [] as Array<{ unitId: string; label: string }>),
}));

vi.mock("@/lib/auth/guards", () => ({ requireCapability: mockRequireCapability }));
vi.mock("@/lib/auth/ownership", () => ({ checkOwnership: mockCheckOwnership }));
vi.mock("@/lib/db/client", () => ({
  db: {
    query: { sites: { findFirst: mockFindSite } },
    select: () => ({ from: () => ({ where: mockSelectWhere }) }),
  },
}));
vi.mock("@/lib/db/queries/materialUnitRule", () => ({ materialUnitRuleFor: mockUnitRuleFor }));
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

  it("rejects a PATCH that un-tags an entry", async () => {
    // Un-tagging was allowed until Work Stage became mandatory. The form no
    // longer offers a clear affordance; the route must refuse it outright too.
    for (const type of ["labour", "machinery", "expense"] as const) {
      mockGetEntryById.mockResolvedValue({ siteId: "s1", createdBy: "u1", workType: "Mason" });
      const res = await PATCH(reqType(type, { workStage: null }), ctx);
      expect(res.status, `${type} un-tag should be rejected`).toBe(400);
    }
    expect(mockUpdateEntryById).not.toHaveBeenCalled();
  });

  it("allows a PATCH on a legacy entry that omits workStage", async () => {
    // The route only catalog-checks fields present in the body, so an entry
    // predating the Work Stage column stays editable. If this breaks,
    // supervisors cannot correct old wages without inventing a phase.
    mockGetEntryById.mockResolvedValue({ siteId: "s1", createdBy: "u1", workType: "Mason", workStage: null });
    const res = await PATCH(reqType("labour", { wagePerHead: 800 }), ctx);
    expect(res.status).toBe(200);
    expect(mockAssertCatalog).not.toHaveBeenCalledWith("Work Stage", expect.anything());
  });
});

describe("PATCH material entries — unit resolution", () => {
  const UNITS = [
    { unitId: "aaaaaaaa-1111-4111-8111-111111111111", label: "Bag" },
    { unitId: "bbbbbbbb-2222-4222-8222-222222222222", label: "Tonne" },
  ];
  const materialRow = {
    siteId: "s1",
    createdBy: "u1",
    materialType: "Sand",
    unit: "Tonne",
    unitMasterId: null,
  };

  async function json(res: Response) {
    return (await res.json()) as { error?: { code: string; message: string } };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCapability.mockResolvedValue({ session: { user: { id: "u1", role: "supervisor" } } });
    mockCheckOwnership.mockReturnValue(true);
    mockFindSite.mockResolvedValue({ archivedAt: null });
    mockAssertCatalog.mockResolvedValue({ ok: true, value: "Roof Level" });
    mockUpdateEntryById.mockImplementation(async (_id: string, _type: string, data: unknown) => data);
    mockSelectWhere.mockResolvedValue(UNITS);
    mockUnitRuleFor.mockResolvedValue({ allowedNames: ["Tonne", "Bag"], preferredName: "Tonne" });
    mockGetEntryById.mockResolvedValue(materialRow);
  });

  it("accepts a submitted unit that the material's rule allows", async () => {
    const res = await PATCH(reqType("material", { unit: "Bag" }), ctx);
    expect(res.status).toBe(200);
    expect(mockUpdateEntryById).toHaveBeenCalledWith(
      "some-id",
      "material",
      expect.objectContaining({
        unitMode: "master",
        unitMasterId: UNITS[0].unitId,
        unitCustomId: null,
        unit: "Bag",
      }),
    );
  });

  it("auto-assigns when the material allows exactly one unit", async () => {
    mockUnitRuleFor.mockResolvedValue({ allowedNames: ["Bag"], preferredName: "Bag" });
    const res = await PATCH(reqType("material", { unit: "Tonne" }), ctx);
    expect(res.status).toBe(200);
    expect(mockUpdateEntryById).toHaveBeenCalledWith(
      "some-id",
      "material",
      expect.objectContaining({ unitMasterId: UNITS[0].unitId, unit: "Bag" }),
    );
  });

  it("REJECTS an unallowed unit instead of silently falling back", async () => {
    mockUnitRuleFor.mockResolvedValue({ allowedNames: ["Tonne", "CFT"], preferredName: "Tonne" });
    const res = await PATCH(reqType("material", { unit: "Bag" }), ctx);
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error?.message).toBe("Sand must use Tonne or CFT as the unit");
    expect(mockUpdateEntryById).not.toHaveBeenCalled();
  });

  it("resolves against the NEW materialType when the type is being changed", async () => {
    mockUnitRuleFor.mockResolvedValue({ allowedNames: ["Bag"], preferredName: "Bag" });
    const res = await PATCH(reqType("material", { materialType: "Cement" }), ctx);
    expect(res.status).toBe(200);
    expect(mockUnitRuleFor).toHaveBeenCalledWith("Cement");
    expect(mockUpdateEntryById).toHaveBeenCalledWith(
      "some-id",
      "material",
      expect.objectContaining({ unit: "Bag" }),
    );
  });

  it("rejects when the row's existing unit is disallowed by the new materialType", async () => {
    // Only the type changes; the unit falls back to the stored "Tonne", which
    // the new type does not allow → 400 rather than a silent rewrite.
    mockUnitRuleFor.mockResolvedValue({ allowedNames: ["Bag", "CFT"], preferredName: "Bag" });
    const res = await PATCH(reqType("material", { materialType: "Cement" }), ctx);
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error?.message).toBe("Cement must use Bag or CFT as the unit");
  });

  it("does not touch unit fields when the update changes neither type nor unit", async () => {
    const res = await PATCH(reqType("material", { quantity: 5 }), ctx);
    expect(res.status).toBe(200);
    expect(mockUnitRuleFor).not.toHaveBeenCalled();
    const data = mockUpdateEntryById.mock.calls[0][2] as Record<string, unknown>;
    expect(data).not.toHaveProperty("unitMode");
    expect(data).not.toHaveProperty("unitMasterId");
    expect(data).not.toHaveProperty("unit");
  });
});
