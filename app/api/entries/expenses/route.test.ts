import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireSiteAccess, mockCheckOwnership, mockFindSite,
  mockInsertExpense, mockAssertCatalog, mockGetSpend, mockGetAdmins,
} = vi.hoisted(() => ({
  mockRequireSiteAccess: vi.fn(),
  mockCheckOwnership: vi.fn(),
  mockFindSite: vi.fn(),
  mockInsertExpense: vi.fn(),
  mockAssertCatalog: vi.fn(),
  mockGetSpend: vi.fn(),
  mockGetAdmins: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireSiteAccess: mockRequireSiteAccess }));
vi.mock("@/lib/auth/ownership", () => ({ checkOwnership: mockCheckOwnership }));
vi.mock("@/lib/db/client", () => ({
  db: { query: { sites: { findFirst: mockFindSite } } },
}));
vi.mock("@/lib/db/queries/entries", () => ({
  insertExpenseEntry: mockInsertExpense,
  // findMatchingExpenseEntry / mergeExpenseEntry intentionally absent:
  // if the route still imports them, this mock throws at import → test fails.
}));
vi.mock("@/lib/db/queries/sites", () => ({ getSiteTrackedSpend: mockGetSpend }));
vi.mock("@/lib/db/queries/notifications", () => ({
  createNotification: vi.fn(), getAllAdmins: mockGetAdmins,
}));
vi.mock("@/lib/cache/invalidate", () => ({ invalidateAdminAnalyticsCache: vi.fn() }));
vi.mock("@/lib/services/nonCritical", () => ({ runNonCritical: vi.fn() }));
vi.mock("@/lib/validation/catalogList", () => ({ assertInCatalogList: mockAssertCatalog }));

import { POST } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/entries/expenses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const base = {
  siteId: "11111111-1111-4111-8111-111111111111",
  date: "2026-07-15",
  category: "Materials",
  description: "cement",
  amount: 100,
};

describe("POST expense — no consolidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSiteAccess.mockResolvedValue({ session: { user: { id: "u1", role: "supervisor" } } });
    mockAssertCatalog.mockResolvedValue({ ok: true, value: "Materials" });
    mockFindSite.mockResolvedValue({ supervisorId: "u1", budget: null, name: "Site", archivedAt: null });
    mockCheckOwnership.mockReturnValue(true);
    mockGetSpend.mockResolvedValue("0");
    mockGetAdmins.mockResolvedValue([]);
    mockInsertExpense.mockImplementation(async (d: any) => ({ expenseEntryId: "e-new", ...d }));
  });

  it("always inserts (never merges) and returns 201", async () => {
    const res = await POST(req(base));
    expect(res.status).toBe(201);
    expect(mockInsertExpense).toHaveBeenCalledTimes(1);
  });

  it("second same site+date+category entry inserts a second row (201)", async () => {
    await POST(req(base));
    const res = await POST(req(base));
    expect(res.status).toBe(201);
    expect(mockInsertExpense).toHaveBeenCalledTimes(2);
  });
});
