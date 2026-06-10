import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireCapability,
  mockGetActorRole,
  mockServiceClient,
  mockInsert,
  mockScheduleAudit,
  mockCreateUser,
  mockDeleteUser,
} = vi.hoisted(() => {
  const mockCreateUser = vi.fn();
  const mockDeleteUser = vi.fn();
  return {
    mockRequireCapability: vi.fn(),
    mockGetActorRole: vi.fn(),
    mockServiceClient: vi.fn(() => ({
      auth: { admin: { createUser: mockCreateUser, deleteUser: mockDeleteUser } },
    })),
    mockInsert: vi.fn(),
    mockScheduleAudit: vi.fn(),
    mockCreateUser,
    mockDeleteUser,
  };
});

vi.mock("@/lib/auth/guards", () => ({ requireCapability: mockRequireCapability }));
vi.mock("@/lib/auth/actorRole", () => ({ getActorRoleFromDb: mockGetActorRole }));
vi.mock("@/lib/auth/config", () => ({ createSupabaseServiceClient: mockServiceClient }));
vi.mock("@/lib/audit/log", () => ({ scheduleAudit: mockScheduleAudit }));
vi.mock("@/lib/db/client", () => ({ db: { insert: () => ({ values: mockInsert }) } }));
vi.mock("@/lib/utils/requestId", () => ({ generateRequestId: () => "req_test" }));

import { POST } from "./route";

function post(body: Record<string, unknown>) {
  const req = new NextRequest("http://localhost/api/admin/users", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  return POST(req);
}

const validBody = { email: "new@co.com", tempPassword: "temppass123", role: "Supervisor" };

describe("POST /api/admin/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCapability.mockResolvedValue({ session: { user: { id: "admin-1", role: "Admin" } } });
    mockGetActorRole.mockResolvedValue("Admin");
    mockCreateUser.mockResolvedValue({ data: { user: { id: "new-1" } }, error: null });
    mockDeleteUser.mockResolvedValue({});
    mockInsert.mockResolvedValue(undefined);
  });

  it("403s when the stateful actor check fails", async () => {
    mockGetActorRole.mockResolvedValue("Supervisor");
    const res = await post(validBody);
    expect(res.status).toBe(403);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("rejects an invalid body before touching GoTrue", async () => {
    const res = await post({ email: "bad", tempPassword: "x", role: "Supervisor" });
    expect(res.status).toBe(400);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("creates the account and audits", async () => {
    const res = await post(validBody);
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data.userId).toBe("new-1");
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "new@co.com", email_confirm: true }),
    );
    expect(mockScheduleAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.created" }),
    );
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("rolls back the orphan auth user when the profile insert fails", async () => {
    mockInsert.mockRejectedValue(Object.assign(new Error("dup"), { code: "23505" }));
    const res = await post(validBody);
    expect(res.status).toBe(409); // handleDbError maps unique violation
    expect(mockDeleteUser).toHaveBeenCalledWith("new-1");
    expect(mockScheduleAudit).not.toHaveBeenCalled();
  });

  it("surfaces a GoTrue createUser failure without inserting a profile", async () => {
    mockCreateUser.mockResolvedValue({ data: null, error: { message: "exists", status: 422 } });
    const res = await post(validBody);
    expect(res.status).toBe(409);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
