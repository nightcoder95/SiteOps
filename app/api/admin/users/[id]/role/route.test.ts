import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireCapability,
  mockGetActorRole,
  mockInvalidateClaims,
  mockInvalidateProfile,
  mockRevokeSessions,
  mockScheduleAudit,
  mockTransaction,
} = vi.hoisted(() => ({
  mockRequireCapability: vi.fn(),
  mockGetActorRole: vi.fn(),
  mockInvalidateClaims: vi.fn(),
  mockInvalidateProfile: vi.fn(),
  mockRevokeSessions: vi.fn(),
  mockScheduleAudit: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireCapability: mockRequireCapability }));
vi.mock("@/lib/auth/actorRole", () => ({ getActorRoleFromDb: mockGetActorRole }));
vi.mock("@/lib/auth/refreshClaims", () => ({ invalidateUserClaims: mockInvalidateClaims }));
vi.mock("@/lib/auth/sessions", () => ({ revokeUserSessions: mockRevokeSessions }));
vi.mock("@/lib/cache/invalidate", () => ({ invalidateUserProfileCache: mockInvalidateProfile }));
vi.mock("@/lib/audit/log", () => ({ scheduleAudit: mockScheduleAudit }));
vi.mock("@/lib/db/client", () => ({ db: { transaction: mockTransaction } }));
vi.mock("@/lib/utils/requestId", () => ({ generateRequestId: () => "req_test" }));

import { PATCH } from "./route";

// Build a tx whose first `select().from().where().for()` returns the admin rows
// and second `select().from().where().limit()` returns the target row.
function makeTx(admins: unknown[], target: unknown[], updateSpy = vi.fn()) {
  const queue: unknown[][] = [admins, target];
  const builder = {
    from: () => builder,
    where: () => builder,
    for: () => Promise.resolve(queue.shift()),
    limit: () => Promise.resolve(queue.shift()),
  };
  return {
    select: () => builder,
    update: () => ({ set: () => ({ where: updateSpy }) }),
  };
}

function patch(id: string, role: string) {
  const req = new NextRequest(`http://localhost/api/admin/users/${id}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
    headers: { "content-type": "application/json" },
  });
  return PATCH(req, { params: Promise.resolve({ id }) });
}

describe("PATCH /api/admin/users/[id]/role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCapability.mockResolvedValue({ session: { user: { id: "admin-1", role: "Admin" } } });
    mockGetActorRole.mockResolvedValue("Admin");
  });

  it("403s when the stateful actor check fails (demoted admin, stale token)", async () => {
    mockGetActorRole.mockResolvedValue("Supervisor");
    const res = await patch("u2", "Admin");
    expect(res.status).toBe(403);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("refuses to demote the only remaining admin", async () => {
    mockTransaction.mockImplementation(async (cb) =>
      cb(makeTx([{ userId: "u1" }], [{ role: "Admin" }])),
    );
    const res = await patch("u1", "Supervisor");
    expect(res.status).toBe(409);
    expect(mockInvalidateClaims).not.toHaveBeenCalled();
  });

  it("promotes a supervisor and invalidates claims + audits", async () => {
    const updateSpy = vi.fn().mockResolvedValue(undefined);
    mockTransaction.mockImplementation(async (cb) =>
      cb(makeTx([{ userId: "a1" }], [{ role: "Supervisor" }], updateSpy)),
    );
    const res = await patch("u2", "Admin");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.changed).toBe(true);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(mockInvalidateClaims).toHaveBeenCalledWith("u2");
    expect(mockScheduleAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "role.changed" }),
    );
  });

  it("revokes the target's sessions when demoting an admin (two admins exist)", async () => {
    const updateSpy = vi.fn().mockResolvedValue(undefined);
    mockTransaction.mockImplementation(async (cb) =>
      cb(makeTx([{ userId: "a1" }, { userId: "a2" }], [{ role: "Admin" }], updateSpy)),
    );
    const res = await patch("a2", "Supervisor");
    expect(res.status).toBe(200);
    expect(mockRevokeSessions).toHaveBeenCalledWith("a2");
  });

  it("does not revoke sessions on a promotion", async () => {
    const updateSpy = vi.fn().mockResolvedValue(undefined);
    mockTransaction.mockImplementation(async (cb) =>
      cb(makeTx([{ userId: "a1" }], [{ role: "Supervisor" }], updateSpy)),
    );
    await patch("u2", "Admin");
    expect(mockRevokeSessions).not.toHaveBeenCalled();
  });

  it("returns 404 when the target user does not exist", async () => {
    mockTransaction.mockImplementation(async (cb) => cb(makeTx([{ userId: "a1" }], [])));
    const res = await patch("ghost", "Admin");
    expect(res.status).toBe(404);
  });

  it("no-ops when the role is unchanged", async () => {
    mockTransaction.mockImplementation(async (cb) =>
      cb(makeTx([{ userId: "a1" }], [{ role: "Admin" }])),
    );
    const res = await patch("a1", "Admin");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.changed).toBe(false);
    expect(mockInvalidateClaims).not.toHaveBeenCalled();
  });
});
