import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireSiteAccess, mockCheckOwnership, mockFindSite, mockInsertMaterial,
  mockAssertCatalog, mockUnitRuleFor, mockSelectWhere,
} = vi.hoisted(() => ({
  mockRequireSiteAccess: vi.fn(),
  mockCheckOwnership: vi.fn(),
  mockFindSite: vi.fn(),
  mockInsertMaterial: vi.fn(),
  mockAssertCatalog: vi.fn(),
  mockUnitRuleFor: vi.fn(),
  mockSelectWhere: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireSiteAccess: mockRequireSiteAccess }));
vi.mock("@/lib/auth/ownership", () => ({ checkOwnership: mockCheckOwnership }));
vi.mock("@/lib/db/client", () => ({
  db: {
    query: { sites: { findFirst: mockFindSite } },
    // db.select({...}).from(unitMaster).where(eq(...)) → active unit rows
    select: () => ({ from: () => ({ where: mockSelectWhere }) }),
  },
}));
vi.mock("@/lib/db/queries/entries", () => ({ insertMaterialEntry: mockInsertMaterial }));
vi.mock("@/lib/db/queries/materialUnitRule", () => ({ materialUnitRuleFor: mockUnitRuleFor }));
vi.mock("@/lib/cache/invalidate", () => ({ invalidateAdminAnalyticsCache: vi.fn() }));
vi.mock("@/lib/services/nonCritical", () => ({ runNonCritical: vi.fn() }));
vi.mock("@/lib/validation/catalogList", () => ({ assertInCatalogList: mockAssertCatalog }));

import { ERROR_CODES } from "@/lib/errors/codes";
import { POST } from "./route";

const UNITS = [
  { unitId: "aaaaaaaa-1111-4111-8111-111111111111", label: "Bag" },
  { unitId: "bbbbbbbb-2222-4222-8222-222222222222", label: "Tonne" },
];

function req(body: unknown) {
  return new NextRequest("http://localhost/api/entries/materials", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const base = {
  siteId: "11111111-1111-4111-8111-111111111111",
  date: "2026-07-15",
  materialType: "Sand",
  quantity: 5,
  unit: "Tonne",
  workStage: "Basement Level",
};

async function json(res: Response) {
  return (await res.json()) as { success: boolean; data?: unknown; error?: { code: string; message: string } };
}

describe("POST materials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSiteAccess.mockResolvedValue({ session: { user: { id: "u1", role: "supervisor" } } });
    mockFindSite.mockResolvedValue({ supervisorId: "u1", archivedAt: null });
    mockCheckOwnership.mockReturnValue(true);
    mockAssertCatalog.mockResolvedValue({ ok: true, value: "Basement Level" });
    mockSelectWhere.mockResolvedValue(UNITS);
    mockUnitRuleFor.mockResolvedValue({ allowedNames: ["Tonne", "Bag"], preferredName: "Tonne" });
    mockInsertMaterial.mockImplementation(async (d: Record<string, unknown>) => ({ materialEntryId: "m-new", ...d }));
  });

  it("stores the submitted unit when the material's rule allows it", async () => {
    const res = await POST(req(base));
    expect(res.status).toBe(201);
    expect(mockInsertMaterial).toHaveBeenCalledWith(
      expect.objectContaining({
        unitMode: "master",
        unitMasterId: UNITS[1].unitId,
        unitCustomId: null,
        unit: "Tonne",
      }),
    );
  });

  it("resolves a submitted unitMasterId to its label", async () => {
    const res = await POST(req({
      ...base,
      unit: undefined,
      materialTypeMode: "default_enum",
      materialTypeEnum: "Steel",
      unitMode: "master",
      unitMasterId: UNITS[0].unitId,
    }));
    expect(res.status).toBe(201);
    expect(mockInsertMaterial).toHaveBeenCalledWith(
      expect.objectContaining({ unitMasterId: UNITS[0].unitId, unit: "Bag" }),
    );
  });

  it("auto-assigns the only allowed unit even when the client submits another", async () => {
    mockUnitRuleFor.mockResolvedValue({ allowedNames: ["Bag"], preferredName: "Bag" });
    const res = await POST(req({ ...base, materialType: "Cement", unit: "Tonne" }));
    expect(res.status).toBe(201);
    expect(mockInsertMaterial).toHaveBeenCalledWith(
      expect.objectContaining({ unitMasterId: UNITS[0].unitId, unit: "Bag" }),
    );
  });

  it("rejects a unit the material's rule does not allow", async () => {
    mockUnitRuleFor.mockResolvedValue({ allowedNames: ["Tonne", "CFT"], preferredName: "Tonne" });
    const res = await POST(req({ ...base, unit: "Bag" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error?.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(body.error?.message).toBe("Sand must use Tonne or CFT as the unit");
    expect(mockInsertMaterial).not.toHaveBeenCalled();
  });

  it("rejects when the submitted unitMasterId is not an active unit", async () => {
    const res = await POST(req({
      ...base,
      unit: undefined,
      materialTypeMode: "default_enum",
      materialTypeEnum: "Steel",
      unitMode: "master",
      unitMasterId: "cccccccc-3333-4333-8333-333333333333",
    }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error?.message).toBe("Sand must use Tonne or Bag as the unit");
  });

  it("rejects when the allowed unit has no active unit_master row", async () => {
    mockUnitRuleFor.mockResolvedValue({ allowedNames: ["CFT"], preferredName: "CFT" });
    const res = await POST(req({ ...base, unit: "CFT" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error?.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(body.error?.message).toBe("Sand must use CFT as the unit");
  });

  it("returns 404 for an archived site", async () => {
    mockFindSite.mockResolvedValue({ supervisorId: "u1", archivedAt: "2026-01-01" });
    const res = await POST(req(base));
    expect(res.status).toBe(404);
    expect((await json(res)).error?.message).toBe("Site not found");
  });

  it("returns 403 when the site is supervised by someone else", async () => {
    mockCheckOwnership.mockReturnValue(false);
    const res = await POST(req(base));
    expect(res.status).toBe(403);
    expect((await json(res)).error?.message).toBe("You can only log entries for sites you supervise");
  });

  it("passes the auth guard's error through unchanged", async () => {
    mockRequireSiteAccess.mockResolvedValue({ error: ERROR_CODES.UNAUTHORIZED, status: 401 });
    const res = await POST(req(base));
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.error?.code).toBe(ERROR_CODES.UNAUTHORIZED);
    expect(body.error?.message).toBe("Authentication required");
  });

  it("rejects a workStage outside the managed catalog list", async () => {
    mockAssertCatalog.mockResolvedValue({ ok: false, message: "Work Stage \"Ghost\" is not in the managed list" });
    const res = await POST(req({ ...base, workStage: "Ghost" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error?.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(body.error?.message).toBe("Work Stage \"Ghost\" is not in the managed list");
    expect(mockInsertMaterial).not.toHaveBeenCalled();
  });

  it("canonicalises workStage before storing", async () => {
    mockAssertCatalog.mockResolvedValue({ ok: true, value: "Basement Level" });
    const res = await POST(req({ ...base, workStage: "basement level" }));
    expect(res.status).toBe(201);
    expect(mockAssertCatalog).toHaveBeenCalledWith("Work Stage", "basement level");
    expect(mockInsertMaterial).toHaveBeenCalledWith(
      expect.objectContaining({ workStage: "Basement Level" }),
    );
  });
});
