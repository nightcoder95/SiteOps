import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireAuth,
  mockServiceClient,
  mockAuthClient,
  mockGetUserById,
  mockUpdateUserById,
  mockSignInWithPassword,
  mockInvalidateClaims,
  mockInvalidateProfile,
  mockRevokeSessions,
  mockDbWhere,
} = vi.hoisted(() => {
  const mockGetUserById = vi.fn();
  const mockUpdateUserById = vi.fn();
  const mockSignInWithPassword = vi.fn();
  return {
    mockRequireAuth: vi.fn(),
    mockGetUserById,
    mockUpdateUserById,
    mockSignInWithPassword,
    mockServiceClient: vi.fn(() => ({
      auth: { admin: { getUserById: mockGetUserById, updateUserById: mockUpdateUserById } },
    })),
    mockAuthClient: vi.fn(() => ({
      auth: { signInWithPassword: mockSignInWithPassword },
    })),
    mockInvalidateClaims: vi.fn(),
    mockInvalidateProfile: vi.fn(),
    mockRevokeSessions: vi.fn(),
    mockDbWhere: vi.fn(),
  };
});

vi.mock("@/lib/auth/guards", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/auth/config", () => ({
  createSupabaseServiceClient: mockServiceClient,
  createSupabaseAuthClient: mockAuthClient,
}));
vi.mock("@/lib/auth/refreshClaims", () => ({ invalidateUserClaims: mockInvalidateClaims }));
vi.mock("@/lib/auth/sessions", () => ({ revokeUserSessions: mockRevokeSessions }));
vi.mock("@/lib/cache/invalidate", () => ({ invalidateUserProfileCache: mockInvalidateProfile }));
vi.mock("@/lib/db/client", () => ({
  db: { update: () => ({ set: () => ({ where: mockDbWhere }) }) },
}));
vi.mock("@/lib/db/schema", () => ({ userProfiles: { userId: "user_id" } }));
vi.mock("@/lib/utils/requestId", () => ({ generateRequestId: () => "req_test" }));

import { POST } from "./route";

function post(body: Record<string, unknown>) {
  const req = new NextRequest("http://localhost/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  return POST(req);
}

const validBody = { currentPassword: "oldpassword1", newPassword: "newpassword12" };

describe("POST /api/auth/change-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({
      session: { user: { id: "u1", email: "u@co.com", role: "Supervisor" } },
    });
    mockGetUserById.mockResolvedValue({ data: { user: { email: "u@co.com" } } });
    mockSignInWithPassword.mockResolvedValue({ error: null });
    mockUpdateUserById.mockResolvedValue({ error: null });
    mockDbWhere.mockResolvedValue(undefined);
  });

  it("401s when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValue({ error: "UNAUTHORIZED", status: 401 });
    const res = await post(validBody);
    expect(res.status).toBe(401);
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it("rejects a new password below the 10-char floor", async () => {
    const res = await post({ currentPassword: "oldpassword1", newPassword: "short" });
    expect(res.status).toBe(400);
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it("401s on wrong current password and does not update", async () => {
    mockSignInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    const res = await post(validBody);
    expect(res.status).toBe(401);
    expect(mockUpdateUserById).not.toHaveBeenCalled();
    expect(mockRevokeSessions).not.toHaveBeenCalled();
  });

  it("updates the password, clears the flag, and revokes sessions on success", async () => {
    const res = await post(validBody);
    expect(res.status).toBe(200);
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: "u@co.com",
      password: "oldpassword1",
    });
    expect(mockUpdateUserById).toHaveBeenCalledWith("u1", { password: "newpassword12" });
    expect(mockInvalidateClaims).toHaveBeenCalledWith("u1");
    expect(mockRevokeSessions).toHaveBeenCalledWith("u1");
  });
});
