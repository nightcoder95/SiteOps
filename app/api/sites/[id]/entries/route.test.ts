import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireSiteAccess, mockCheckOwnership, mockGetSiteById, mockGetEntriesBySite } =
  vi.hoisted(() => ({
    mockRequireSiteAccess: vi.fn(),
    mockCheckOwnership: vi.fn(),
    mockGetSiteById: vi.fn(),
    mockGetEntriesBySite: vi.fn(),
  }));

vi.mock("@/lib/auth/guards", () => ({ requireSiteAccess: mockRequireSiteAccess }));
vi.mock("@/lib/auth/ownership", () => ({ checkOwnership: mockCheckOwnership }));
vi.mock("@/lib/db/queries/sites", () => ({ getSiteById: mockGetSiteById }));
vi.mock("@/lib/db/queries/entries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/queries/entries")>(
    "@/lib/db/queries/entries",
  );
  // Only the fetcher is mocked; the cursor codec stays real so the test asserts
  // the actual encoding the route produces.
  return { ...actual, getEntriesBySite: mockGetEntriesBySite };
});

import { GET } from "./route";
import { decodeEntriesCursor } from "@/lib/db/queries/entries";

const SITE_ID = "11111111-1111-4111-8111-111111111111";

function req(query: string) {
  return new NextRequest(`http://localhost/api/sites/${SITE_ID}/entries${query}`);
}
const ctx = { params: Promise.resolve({ id: SITE_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSiteAccess.mockResolvedValue({ session: { user: { id: "u1", role: "Admin" } } });
  mockGetSiteById.mockResolvedValue({ siteId: SITE_ID, supervisorId: "u1", archivedAt: null });
  mockCheckOwnership.mockReturnValue(true);
  mockGetEntriesBySite.mockResolvedValue([]);
});

describe("GET /api/sites/[id]/entries — pagination", () => {
  it("passes no cursor when `after` is absent, so the first page is unchanged", async () => {
    await GET(req("?type=labour"), ctx);
    expect(mockGetEntriesBySite.mock.calls[0][2].cursor).toBeUndefined();
  });

  it("turns `after` into a keyset cursor for the boundary row", async () => {
    await GET(req("?type=labour&after=41"), ctx);
    const { cursor } = mockGetEntriesBySite.mock.calls[0][2];
    expect(decodeEntriesCursor(cursor)).toEqual({ id: 41 });
  });

  it("ignores a non-numeric `after` rather than rejecting the request", async () => {
    // `after` is a UI continuation token, not user input to validate loudly —
    // a bad one should show the first page, not a 400.
    const res = await GET(req("?type=labour&after=not-a-number"), ctx);
    expect(res.status).toBe(200);
    expect(mockGetEntriesBySite.mock.calls[0][2].cursor).toBeUndefined();
  });

  it("ignores a non-positive `after`", async () => {
    await GET(req("?type=labour&after=0"), ctx);
    expect(mockGetEntriesBySite.mock.calls[0][2].cursor).toBeUndefined();
  });

  it("still enforces site ownership before it reads anything", async () => {
    mockCheckOwnership.mockReturnValue(false);
    const res = await GET(req("?type=labour&after=41"), ctx);
    expect(res.status).toBe(403);
    expect(mockGetEntriesBySite).not.toHaveBeenCalled();
  });
});
