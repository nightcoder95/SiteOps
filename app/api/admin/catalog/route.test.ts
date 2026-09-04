import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireCapability, mockWithStatementTimeout, mockFetchUsageCounts,
  mockGetOrSetJson, mockBuildOverview,
} = vi.hoisted(() => ({
  mockRequireCapability: vi.fn(),
  mockWithStatementTimeout: vi.fn(),
  mockFetchUsageCounts: vi.fn(),
  mockGetOrSetJson: vi.fn(),
  mockBuildOverview: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireCapability: mockRequireCapability }));
vi.mock("@/lib/db/guard", () => ({ withStatementTimeout: mockWithStatementTimeout }));
vi.mock("@/lib/catalog/overviewQuery", () => ({ fetchUsageCounts: mockFetchUsageCounts }));
vi.mock("@/lib/catalog/overview", () => ({ buildCatalogOverview: mockBuildOverview }));
vi.mock("@/lib/cache/getOrSetJson", () => ({ getOrSetJson: mockGetOrSetJson }));
vi.mock("@/lib/utils/requestId", () => ({ generateRequestId: () => "req_test" }));

import { catalogOverviewCacheKey } from "@/lib/cache/keys";
import { ERROR_CODES } from "@/lib/errors/codes";
import { GET } from "./route";

const CATEGORY_ROWS = [{ categoryId: "c1", name: "Labour" }];
const SUB_ROWS = [
  { subcategoryId: "s1", categoryId: "c1", name: "Masonry", isActive: true, sortOrder: 1 },
];
const OVERVIEW = [
  { operation: "Labour", lists: [{ listKey: "labour", items: [{ subcategoryId: "s1", usageCount: 42 }] }] },
];

function req() {
  return new NextRequest("http://localhost/api/admin/catalog");
}

async function json(res: Response) {
  return (await res.json()) as {
    data?: { operations: unknown };
    error?: { code: string; message: string };
  };
}

describe("GET /api/admin/catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCapability.mockResolvedValue({ session: { user: { id: "u1" } } });
    // The route's compute() calls withStatementTimeout(tx => …); give it a tx
    // whose select() chain returns the category rows then the subcategory rows.
    let call = 0;
    mockWithStatementTimeout.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        select: () => ({ from: () => Promise.resolve(call++ === 0 ? CATEGORY_ROWS : SUB_ROWS) }),
      }),
    );
    mockFetchUsageCounts.mockResolvedValue(new Map([["Labour", new Map([["Masonry", 42]])]]));
    mockBuildOverview.mockReturnValue(OVERVIEW);
    // Default: cache miss — run compute and report hit: false.
    mockGetOrSetJson.mockImplementation(async (
      _requestId: string,
      _key: string,
      _ttl: number,
      compute: () => Promise<unknown>,
    ) => ({ value: await compute(), hit: false }));
  });

  it("computes the overview on a cache miss and returns it", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await json(res)).data?.operations).toEqual(OVERVIEW);
    expect(mockWithStatementTimeout).toHaveBeenCalledTimes(1);
  });

  it("serves an identical body from a cache hit without touching the database", async () => {
    const miss = await json(await GET(req()));
    vi.clearAllMocks();
    mockRequireCapability.mockResolvedValue({ session: { user: { id: "u1" } } });
    mockGetOrSetJson.mockResolvedValue({ value: OVERVIEW, hit: true });

    const res = await GET(req());
    expect(res.status).toBe(200);
    // Byte-identical to the miss body: guards the Map-serialisation trap, where
    // caching the raw usage Map would zero every count on a hit.
    expect((await json(res)).data?.operations).toEqual(miss.data?.operations);
    expect(mockWithStatementTimeout).not.toHaveBeenCalled();
  });

  it("still returns the computed body when redis is unavailable", async () => {
    // getOrSetJson degrades by calling compute() directly — the dev path.
    mockGetOrSetJson.mockImplementation(async (
      _requestId: string,
      _key: string,
      _ttl: number,
      compute: () => Promise<unknown>,
    ) => ({ value: await compute(), hit: false }));
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await json(res)).data?.operations).toEqual(OVERVIEW);
  });

  it("never reads or warms the cache for an unauthorized caller", async () => {
    mockRequireCapability.mockResolvedValue({ error: ERROR_CODES.FORBIDDEN, status: 403 });
    const res = await GET(req());
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.error?.code).toBe(ERROR_CODES.FORBIDDEN);
    expect(body.error?.message).toBe("Admin access required");
    expect(mockGetOrSetJson).not.toHaveBeenCalled();
    expect(mockWithStatementTimeout).not.toHaveBeenCalled();
  });

  it("uses the global catalog-overview key and a 60s TTL", async () => {
    await GET(req());
    expect(mockGetOrSetJson).toHaveBeenCalledWith(
      expect.any(String),
      catalogOverviewCacheKey(),
      60,
      expect.any(Function),
    );
  });
});
