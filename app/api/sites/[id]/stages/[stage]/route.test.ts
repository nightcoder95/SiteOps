import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireSiteAccess, mockGetSite, mockOwnership, mockComposition } = vi.hoisted(() => ({
  mockRequireSiteAccess: vi.fn(),
  mockGetSite: vi.fn(),
  mockOwnership: vi.fn(),
  mockComposition: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireSiteAccess: mockRequireSiteAccess }));
vi.mock("@/lib/auth/ownership", () => ({ checkOwnership: mockOwnership }));
vi.mock("@/lib/db/queries/sites", () => ({ getSiteById: mockGetSite }));
vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/db/queries/stageSummary", () => ({
  getStageComposition: mockComposition,
  LEGACY_STAGE_KEY: "__legacy__",
  UNTAGGED_STAGE_KEY: "__untagged__",
}));

import { GET } from "./route";

const req = () => new NextRequest("http://localhost/api/sites/s1/stages/x");
const ctx = (stage: string) => ({ params: Promise.resolve({ id: "s1", stage }) });

describe("GET /api/sites/:id/stages/:stage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSiteAccess.mockResolvedValue({ session: { user: { id: "u1", role: "supervisor" } } });
    mockGetSite.mockResolvedValue({ siteId: "s1", supervisorId: "u1", archivedAt: null });
    mockOwnership.mockReturnValue(true);
    mockComposition.mockResolvedValue([]);
  });

  it("rejects an unauthenticated caller", async () => {
    mockRequireSiteAccess.mockResolvedValue({ error: "UNAUTHORIZED", status: 401 });
    expect((await GET(req(), ctx("Roof Level"))).status).toBe(401);
    expect(mockComposition).not.toHaveBeenCalled();
  });

  it("404s for a missing or archived site", async () => {
    mockGetSite.mockResolvedValue(null);
    expect((await GET(req(), ctx("Roof Level"))).status).toBe(404);

    mockGetSite.mockResolvedValue({ siteId: "s1", supervisorId: "u1", archivedAt: new Date() });
    expect((await GET(req(), ctx("Roof Level"))).status).toBe(404);
    expect(mockComposition).not.toHaveBeenCalled();
  });

  it("refuses a caller who does not supervise the site", async () => {
    mockOwnership.mockReturnValue(false);
    expect((await GET(req(), ctx("Roof Level"))).status).toBe(403);
    expect(mockComposition).not.toHaveBeenCalled();
  });

  it("maps the legacy sentinel to a null stage with the legacy cut", async () => {
    await GET(req(), ctx("__legacy__"));
    expect(mockComposition).toHaveBeenCalledWith({}, "s1", null, { legacy: true });
  });

  it("maps the untagged sentinel to a null stage without the legacy cut", async () => {
    await GET(req(), ctx("__untagged__"));
    expect(mockComposition).toHaveBeenCalledWith({}, "s1", null, { legacy: false });
  });

  it("passes a decoded stage name through", async () => {
    await GET(req(), ctx(encodeURIComponent("Blockwork/Brickwork")));
    expect(mockComposition).toHaveBeenCalledWith({}, "s1", "Blockwork/Brickwork", { legacy: false });
  });

  it("returns the rows in the standard envelope", async () => {
    mockComposition.mockResolvedValue([{ entryType: "material", name: "Cement", spend: 100 }]);
    const body = await (await GET(req(), ctx("Roof Level"))).json();
    expect(body.data.rows).toHaveLength(1);
  });
});
