import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const { mockRequireSiteAccess, mockSelect } = vi.hoisted(() => ({
  mockRequireSiteAccess: vi.fn(),
  mockSelect: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireSiteAccess: mockRequireSiteAccess,
}));

vi.mock("@/lib/db/client", () => ({
  db: { select: mockSelect },
}));

vi.mock("@/lib/utils/requestId", () => ({
  generateRequestId: () => "req_test",
}));

function mockActiveUnits(rows: Array<{ id: string; name: string }>) {
  mockSelect.mockReturnValue({
    from: () => ({ where: () => Promise.resolve(rows) }),
  });
}

function postBody(body: unknown) {
  return new NextRequest("http://localhost/api/catalog/units/similar", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("units/similar route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireSiteAccess.mockResolvedValue({ session: { user: { id: "u1" } } });
  });

  it("flags an exact-match unit name as requiring review", async () => {
    mockActiveUnits([
      { id: "1", name: "Tonne" },
      { id: "2", name: "Litre" },
    ]);

    const res = await POST(postBody({ name: "Tonne" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.requiresReview).toBe(true);
    expect(body.data.candidates[0].name).toBe("Tonne");
    expect(body.data.recommendedAction).toBe("use_existing");
  });

  it("returns no review for a clearly new unit name", async () => {
    mockActiveUnits([{ id: "1", name: "Tonne" }]);

    const res = await POST(postBody({ name: "Furlong" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.requiresReview).toBe(false);
    expect(body.data.candidates).toHaveLength(0);
    expect(body.data.recommendedAction).toBe("create_new");
  });

  it("rejects an empty payload", async () => {
    const res = await POST(postBody({ name: "" }));
    expect(res.status).toBe(400);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    mockRequireSiteAccess.mockResolvedValue({ error: "UNAUTHORIZED", status: 401 });
    const res = await POST(postBody({ name: "Tonne" }));
    expect(res.status).toBe(401);
  });
});
