import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// C3 — automated coverage for the must_change_password gate + redirect-loop
// guard in middleware.ts (previously manual-test only). We mock the Supabase
// SSR client so getClaims() returns a controllable claim set, then assert the
// branch decisions: forced-rotation redirect, the change-password exclusions
// (no loop), the API 403, and the unauthenticated fallbacks.

const { mockGetClaims } = vi.hoisted(() => ({ mockGetClaims: vi.fn() }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getClaims: mockGetClaims },
  })),
}));

vi.mock("@/lib/auth/config", () => ({
  getSupabaseUrl: () => "https://example.supabase.co",
  getSupabaseAnonKey: () => "anon-key",
}));

import { middleware } from "@/middleware";

function requestFor(path: string, method = "GET") {
  return new NextRequest(new URL(`https://app.test${path}`), { method });
}

function setClaims(claims: Record<string, unknown> | null) {
  mockGetClaims.mockResolvedValue(
    claims ? { data: { claims }, error: null } : { data: null, error: new Error("no session") },
  );
}

const forcedUser = { sub: "u1", email: "u@co.com", user_role: "Supervisor", must_change_password: true };
const normalUser = { sub: "u1", email: "u@co.com", user_role: "Supervisor" };

describe("middleware — must_change_password gate", () => {
  beforeEach(() => {
    mockGetClaims.mockReset();
  });

  it("redirects a forced-rotation user away from app pages to /auth/change-password", async () => {
    setClaims(forcedUser);
    const res = await middleware(requestFor("/app/dashboard"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/auth/change-password");
  });

  it("does NOT redirect on the change-password page itself (no loop)", async () => {
    setClaims(forcedUser);
    const res = await middleware(requestFor("/auth/change-password"));
    // Passes through (NextResponse.next) — no Location redirect header.
    expect(res.headers.get("location")).toBeNull();
  });

  it("lets the change-password API through so the flag can be cleared", async () => {
    setClaims(forcedUser);
    const res = await middleware(requestFor("/api/auth/change-password", "POST"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).not.toBe(403);
  });

  it("blocks other APIs with 403 PASSWORD_CHANGE_REQUIRED while the flag is set", async () => {
    setClaims(forcedUser);
    const res = await middleware(requestFor("/api/entries"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");
  });
});

describe("middleware — auth fallbacks", () => {
  beforeEach(() => {
    mockGetClaims.mockReset();
  });

  it("redirects an unauthenticated user from a protected page to sign-in", async () => {
    setClaims(null);
    const res = await middleware(requestFor("/app/dashboard"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/auth/sign-in");
  });

  it("401s an unauthenticated API request", async () => {
    setClaims(null);
    const res = await middleware(requestFor("/api/entries"));
    expect(res.status).toBe(401);
  });

  it("redirects an authenticated user off a public auth route to the dashboard", async () => {
    setClaims(normalUser);
    const res = await middleware(requestFor("/auth/sign-in"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/app/dashboard");
  });

  it("lets an authenticated, non-forced user proceed to app pages", async () => {
    setClaims(normalUser);
    const res = await middleware(requestFor("/app/dashboard"));
    expect(res.headers.get("location")).toBeNull();
  });
});
