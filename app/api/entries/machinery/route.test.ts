import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireSiteAccess, mockCheckOwnership, mockFindSite, mockInsertMachinery,
} = vi.hoisted(() => ({
  mockRequireSiteAccess: vi.fn(),
  mockCheckOwnership: vi.fn(),
  mockFindSite: vi.fn(),
  mockInsertMachinery: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireSiteAccess: mockRequireSiteAccess }));
vi.mock("@/lib/auth/ownership", () => ({ checkOwnership: mockCheckOwnership }));
vi.mock("@/lib/db/client", () => ({
  db: { query: { sites: { findFirst: mockFindSite } } },
}));
vi.mock("@/lib/db/queries/entries", () => ({
  insertMachineryEntry: mockInsertMachinery,
  // findMatchingMachineryEntry / mergeMachineryEntry intentionally absent:
  // if the route still imports them, this mock throws at import → test fails.
}));
vi.mock("@/lib/cache/invalidate", () => ({ invalidateAdminAnalyticsCache: vi.fn() }));
vi.mock("@/lib/services/nonCritical", () => ({ runNonCritical: vi.fn() }));

import { POST } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/entries/machinery", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const base = {
  siteId: "11111111-1111-4111-8111-111111111111",
  date: "2026-07-15",
  equipmentType: "Excavator",
  hoursActive: 4,
  count: 1,
  totalCost: 5000,
};

describe("POST machinery — no consolidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSiteAccess.mockResolvedValue({ session: { user: { id: "u1", role: "supervisor" } } });
    mockFindSite.mockResolvedValue({ supervisorId: "u1", archivedAt: null });
    mockCheckOwnership.mockReturnValue(true);
    mockInsertMachinery.mockImplementation(async (d: any) => ({ machineryEntryId: "mc-new", ...d }));
  });

  it("always inserts (never merges) and returns 201", async () => {
    const res = await POST(req(base));
    expect(res.status).toBe(201);
    expect(mockInsertMachinery).toHaveBeenCalledTimes(1);
  });

  it("second same site+date+equipmentType entry inserts a second row (201)", async () => {
    await POST(req(base));
    const res = await POST(req(base));
    expect(res.status).toBe(201);
    expect(mockInsertMachinery).toHaveBeenCalledTimes(2);
  });
});
