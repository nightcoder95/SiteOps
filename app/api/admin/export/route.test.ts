import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ERROR_CODES } from "@/lib/errors/codes";
import { TABLE_KEYS } from "@/lib/export/tableRegistry";

import { GET } from "./route";

const { mockRequireCapability, mockReadFullSnapshot, mockScheduleAudit } = vi.hoisted(() => ({
  mockRequireCapability: vi.fn(),
  mockReadFullSnapshot: vi.fn(),
  mockScheduleAudit: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireCapability: mockRequireCapability }));
vi.mock("@/lib/export/snapshot", () => ({ readFullSnapshot: mockReadFullSnapshot }));
vi.mock("@/lib/audit/log", () => ({ scheduleAudit: mockScheduleAudit }));
vi.mock("@/lib/utils/requestId", () => ({ generateRequestId: () => "req_test" }));

function req() {
  return new NextRequest("http://localhost/api/admin/export");
}

describe("GET /api/admin/export", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("denies an unauthenticated request (401, no data leak)", async () => {
    mockRequireCapability.mockResolvedValue({ error: ERROR_CODES.UNAUTHORIZED, status: 401 });
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(res.headers.get("content-disposition")).toBeNull();
    expect(mockReadFullSnapshot).not.toHaveBeenCalled();
  });

  it("denies a supervisor (403, no data leak)", async () => {
    mockRequireCapability.mockResolvedValue({ error: ERROR_CODES.FORBIDDEN, status: 403 });
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(mockReadFullSnapshot).not.toHaveBeenCalled();
    expect(mockScheduleAudit).not.toHaveBeenCalled();
  });

  it("returns a downloadable JSON backup for an admin, audited", async () => {
    mockRequireCapability.mockResolvedValue({
      session: { user: { id: "admin1", role: "Admin" } },
    });
    mockReadFullSnapshot.mockResolvedValue({ sites: [{ siteId: "s1" }], user_profiles: [] });

    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="siteops-backup-.*\.json"/);
    expect(res.headers.get("cache-control")).toBe("no-store");

    const body = JSON.parse(await res.text());
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("exportedAt");
    expect(Object.keys(body.tables).sort()).toEqual([...TABLE_KEYS].sort());
    expect(body.tables.sites).toEqual([{ siteId: "s1" }]);

    expect(mockScheduleAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "data.export.full", actorUserId: "admin1", allowed: true }),
    );
  });

  it("returns 500 when the snapshot read fails", async () => {
    mockRequireCapability.mockResolvedValue({
      session: { user: { id: "admin1", role: "Admin" } },
    });
    mockReadFullSnapshot.mockRejectedValue(new Error("db down"));
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(mockScheduleAudit).not.toHaveBeenCalled();
  });
});
