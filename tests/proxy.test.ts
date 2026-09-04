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

import { proxy as middleware } from "@/proxy";

function requestFor(path: string, method = "GET") {
  return new NextRequest(new URL(`https://app.test${path}`), { method });
}

function bearerRequestFor(path: string, token: string, method = "GET") {
  return new NextRequest(new URL(`https://app.test${path}`), {
    method,
    headers: { authorization: `Bearer ${token}` },
  });
}

// NextResponse.next({ request: { headers } }) echoes the forwarded request headers
// back as `x-middleware-request-<name>` (with the names listed in
// `x-middleware-override-headers`). Reading them lets us assert what the handler
// will actually receive.
function forwardedHeader(res: { headers: Headers }, name: string): string | null {
  return res.headers.get(`x-middleware-request-${name}`);
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

describe("middleware — inbound x-siteops-* header stripping (defense-in-depth)", () => {
  beforeEach(() => {
    mockGetClaims.mockReset();
  });

  function forgedRequest(path: string) {
    return new NextRequest(new URL(`https://app.test${path}`), {
      headers: {
        "x-siteops-user-id": "attacker",
        "x-siteops-user-email": "attacker@evil.com",
        "x-siteops-user-role": "Admin",
      },
    });
  }

  it("strips a forged identity header on a public-prefix route (no auth work)", async () => {
    const res = await middleware(forgedRequest("/api/health"));
    expect(forwardedHeader(res, "x-siteops-user-role")).toBeNull();
    expect(forwardedHeader(res, "x-siteops-user-id")).toBeNull();
    expect(forwardedHeader(res, "x-siteops-user-email")).toBeNull();
    expect(mockGetClaims).not.toHaveBeenCalled(); // proves the early public-prefix exit was taken
  });

  it("skips all auth work for the CSP report sink, which browsers post without credentials", async () => {
    // The sink must be reachable from the sign-in page and from a session that
    // has expired, so it cannot sit behind the JWT verify.
    const res = await middleware(forgedRequest("/api/csp-report"));
    expect(mockGetClaims).not.toHaveBeenCalled();
  });

  it("still strips a forged identity header on the CSP report sink", async () => {
    // Public does not mean unguarded: the strip-before-exit invariant applies to
    // every new public prefix, or the sink becomes an identity-injection hole.
    const res = await middleware(forgedRequest("/api/csp-report"));
    expect(forwardedHeader(res, "x-siteops-user-id")).toBeNull();
    expect(forwardedHeader(res, "x-siteops-user-role")).toBeNull();
    expect(forwardedHeader(res, "x-siteops-user-email")).toBeNull();
  });

  it("strips forged identity headers on an OPTIONS preflight", async () => {
    const req = new NextRequest(new URL("https://app.test/api/entries"), {
      method: "OPTIONS",
      headers: { "x-siteops-user-role": "Admin" },
    });
    const res = await middleware(req);
    expect(forwardedHeader(res, "x-siteops-user-role")).toBeNull();
  });

  it("does not let a forged role survive into an authenticated request", async () => {
    setClaims(normalUser); // verified role is Supervisor
    const res = await middleware(forgedRequest("/api/entries"));
    // The proxy re-sets role from verified claims — Supervisor, never the forged Admin.
    expect(forwardedHeader(res, "x-siteops-user-role")).toBe("Supervisor");
  });
});

describe("middleware — Authorization: Bearer (native clients)", () => {
  beforeEach(() => {
    mockGetClaims.mockReset();
  });

  it("verifies the bearer token (passes it to getClaims) and lets a valid one through", async () => {
    // getClaims succeeds only when handed the bearer token — proves the bearer path is taken.
    mockGetClaims.mockImplementation((token?: string) =>
      token === "valid.jwt"
        ? { data: { claims: normalUser }, error: null }
        : { data: null, error: new Error("no session") },
    );
    const res = await middleware(bearerRequestFor("/api/entries", "valid.jwt"));
    expect(mockGetClaims).toHaveBeenCalledWith("valid.jwt");
    expect(res.status).not.toBe(401);
    expect(res.headers.get("location")).toBeNull();
  });

  it("401s when the bearer token is expired/invalid", async () => {
    mockGetClaims.mockResolvedValue({ data: null, error: new Error("expired") });
    const res = await middleware(bearerRequestFor("/api/entries", "expired.jwt"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("still enforces PASSWORD_CHANGE_REQUIRED for a bearer user carrying the claim", async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: forcedUser }, error: null });
    const res = await middleware(bearerRequestFor("/api/entries", "forced.jwt"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");
  });

  it("falls back to the cookie path when no bearer header is present", async () => {
    setClaims(normalUser);
    const res = await middleware(requestFor("/api/entries"));
    expect(mockGetClaims).toHaveBeenCalledWith();
    expect(res.status).not.toBe(401);
  });
});
