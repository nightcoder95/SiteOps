import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireSiteAccess, mockCheckOwnership, mockFindSite,
  mockInsertLabour, mockAssertCatalog,
} = vi.hoisted(() => ({
  mockRequireSiteAccess: vi.fn(),
  mockCheckOwnership: vi.fn(),
  mockFindSite: vi.fn(),
  mockInsertLabour: vi.fn(),
  mockAssertCatalog: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireSiteAccess: mockRequireSiteAccess }));
vi.mock("@/lib/auth/ownership", () => ({ checkOwnership: mockCheckOwnership }));
vi.mock("@/lib/db/client", () => ({
  db: { query: { sites: { findFirst: mockFindSite } } },
}));
vi.mock("@/lib/db/queries/entries", () => ({
  insertLabourEntry: mockInsertLabour,
  // findMatchingLabourEntry / mergeLabourEntry intentionally absent:
  // if the route still imports them, this mock throws at import → test fails.
}));
vi.mock("@/lib/cache/invalidate", () => ({ invalidateAdminAnalyticsCache: vi.fn() }));
vi.mock("@/lib/services/nonCritical", () => ({ runNonCritical: vi.fn() }));
vi.mock("@/lib/validation/catalogList", () => ({ assertInCatalogList: mockAssertCatalog }));

import { POST } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/entries/labour", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const base = {
  siteId: "11111111-1111-4111-8111-111111111111",
  date: "2026-07-15",
  workType: "Mason",
  peopleCount: 2,
  wagePerHead: 500,
};

describe("POST labour — no consolidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSiteAccess.mockResolvedValue({ session: { user: { id: "u1", role: "supervisor" } } });
    mockAssertCatalog.mockResolvedValue({ ok: true, value: "Mason" });
    mockFindSite.mockResolvedValue({ supervisorId: "u1", archivedAt: null });
    mockCheckOwnership.mockReturnValue(true);
    mockInsertLabour.mockImplementation(async (d: any) => ({ labourEntryId: "l-new", ...d }));
  });

  it("always inserts (never merges) and returns 201", async () => {
    const res = await POST(req(base));
    expect(res.status).toBe(201);
    expect(mockInsertLabour).toHaveBeenCalledTimes(1);
  });

  it("second same site+date+workType entry inserts a second row (201)", async () => {
    await POST(req(base));
    const res = await POST(req(base));
    expect(res.status).toBe(201);
    expect(mockInsertLabour).toHaveBeenCalledTimes(2);
  });
});
