import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireSiteAccess, mockFindSite } = vi.hoisted(() => ({
  mockRequireSiteAccess: vi.fn(),
  mockFindSite: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireSiteAccess: mockRequireSiteAccess }));
vi.mock("@/lib/db/client", () => ({
  db: { query: { sites: { findFirst: mockFindSite } } },
}));

import { ERROR_CODES } from "@/lib/errors/codes";
import { assertSiteWritable } from "./siteWritable";

const FORBIDDEN = "You can only log entries for sites you supervise";

function req() {
  return new NextRequest("http://localhost/api/entries/labour", { method: "POST" });
}

function call(overrides: { forbiddenMessage?: string } = {}) {
  return assertSiteWritable({
    request: req(),
    siteId: "site-1",
    requestId: "req_test",
    forbiddenMessage: overrides.forbiddenMessage ?? FORBIDDEN,
  });
}

async function body(res: Response) {
  return (await res.json()) as {
    meta?: { requestId: string };
    error?: { code: string; message: string };
  };
}

describe("assertSiteWritable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSiteAccess.mockResolvedValue({ session: { user: { id: "u1", role: "Supervisor" } } });
    mockFindSite.mockResolvedValue({ supervisorId: "u1", archivedAt: null, budget: "1000", name: "Site A" });
  });

  it("returns the site and session when the caller supervises a live site", async () => {
    const result = await call();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.site).toEqual({ supervisorId: "u1", archivedAt: null, budget: "1000", name: "Site A" });
    expect(result.session.user.id).toBe("u1");
  });

  it("selects budget and name too, so callers never need a second site query", async () => {
    await call();
    expect(mockFindSite).toHaveBeenCalledWith(
      expect.objectContaining({
        columns: { supervisorId: true, archivedAt: true, budget: true, name: true },
      }),
    );
  });

  it("passes the guard's failure through with the standard message", async () => {
    mockRequireSiteAccess.mockResolvedValue({ error: ERROR_CODES.UNAUTHORIZED, status: 401 });
    const result = await call();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
    const parsed = await body(result.response);
    expect(parsed.error?.code).toBe(ERROR_CODES.UNAUTHORIZED);
    expect(parsed.error?.message).toBe("Authentication required");
    // Never looks up the site for a request that failed auth.
    expect(mockFindSite).not.toHaveBeenCalled();
  });

  it("404s when the site does not exist", async () => {
    mockFindSite.mockResolvedValue(undefined);
    const result = await call();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(404);
    const parsed = await body(result.response);
    expect(parsed.error?.code).toBe(ERROR_CODES.NOT_FOUND);
    expect(parsed.error?.message).toBe("Site not found");
  });

  it("404s (not 409) when the site is archived — same conflation the routes have always had", async () => {
    mockFindSite.mockResolvedValue({ supervisorId: "u1", archivedAt: new Date("2026-01-01") });
    const result = await call();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(404);
    expect((await body(result.response)).error?.message).toBe("Site not found");
  });

  it("403s with the caller's own copy when someone else supervises the site", async () => {
    mockFindSite.mockResolvedValue({ supervisorId: "other", archivedAt: null });
    const result = await call();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
    const parsed = await body(result.response);
    expect(parsed.error?.code).toBe(ERROR_CODES.FORBIDDEN);
    expect(parsed.error?.message).toBe(FORBIDDEN);
  });

  it("uses the caller-supplied forbiddenMessage verbatim", async () => {
    mockFindSite.mockResolvedValue({ supervisorId: "other", archivedAt: null });
    const result = await call({ forbiddenMessage: "Custom copy" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect((await body(result.response)).error?.message).toBe("Custom copy");
  });

  it("keeps the admin cross-owner override (resource:manage_all)", async () => {
    mockRequireSiteAccess.mockResolvedValue({ session: { user: { id: "admin-1", role: "Admin" } } });
    mockFindSite.mockResolvedValue({ supervisorId: "someone-else", archivedAt: null });
    const result = await call();
    expect(result.ok).toBe(true);
  });

  it("threads the requestId into every error response", async () => {
    mockFindSite.mockResolvedValue(undefined);
    const result = await call();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect((await body(result.response)).meta?.requestId).toBe("req_test");
  });
});
