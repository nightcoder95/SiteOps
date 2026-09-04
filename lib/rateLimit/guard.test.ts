import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The limiters are module-scope singletons built from env, so the guard is
// tested against fakes that record the identifiers they were handed. Asserting
// on those identifiers is the point: the whole S4 fix is a key-derivation
// change, and a key that silently kept the pathname would defeat it.
const perPathLimit = vi.fn();
const globalLimit = vi.fn();

vi.mock("@/lib/rateLimit/upstash", () => ({
  get upstashRateLimit() {
    return perPathState;
  },
  get upstashGlobalRateLimit() {
    return globalState;
  },
}));

let perPathState: { limit: typeof perPathLimit } | null = { limit: perPathLimit };
let globalState: { limit: typeof globalLimit } | null = { limit: globalLimit };

function allowed(limit = 60) {
  return { success: true, limit, remaining: limit - 1, reset: 1_000 };
}
function blocked(limit: number, reset: number) {
  return { success: false, limit, remaining: 0, reset };
}

function makeRequest(
  pathname: string,
  headers: Record<string, string> = {},
): NextRequest {
  return {
    url: `https://siteops.test${pathname}`,
    headers: new Headers(headers),
  } as unknown as NextRequest;
}

async function applyRateLimit(request: NextRequest, requestId = "req_1") {
  const mod = await import("@/lib/rateLimit/guard");
  return mod.applyRateLimit(request, requestId);
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  perPathState = { limit: perPathLimit };
  globalState = { limit: globalLimit };
  perPathLimit.mockReset().mockResolvedValue(allowed());
  globalLimit.mockReset().mockResolvedValue(allowed(600));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("applyRateLimit — both buckets", () => {
  it("returns null when both the per-path and the global bucket allow the request", async () => {
    expect(await applyRateLimit(makeRequest("/api/sites"))).toBeNull();
  });

  it("429s with the per-path bucket's numbers when the per-path bucket is exhausted", async () => {
    perPathLimit.mockResolvedValue(blocked(60, 111));

    const response = await applyRateLimit(makeRequest("/api/sites"));

    expect(response?.status).toBe(429);
    const body = await response!.json();
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.details).toEqual({ limit: 60, remaining: 0, reset: 111 });
  });

  it("429s with the GLOBAL bucket's numbers when only the global bucket is exhausted", async () => {
    globalLimit.mockResolvedValue(blocked(600, 222));

    const response = await applyRateLimit(makeRequest("/api/sites"));

    expect(response?.status).toBe(429);
    const body = await response!.json();
    expect(body.error.details).toEqual({ limit: 600, remaining: 0, reset: 222 });
  });

  it("falls back to the per-path bucket alone when the global limiter is unconfigured", async () => {
    globalState = null;

    expect(await applyRateLimit(makeRequest("/api/sites"))).toBeNull();
    expect(perPathLimit).toHaveBeenCalledTimes(1);
  });

  it("returns null outside production without consulting either bucket", async () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(await applyRateLimit(makeRequest("/api/sites"))).toBeNull();
    expect(perPathLimit).not.toHaveBeenCalled();
    expect(globalLimit).not.toHaveBeenCalled();
  });
});

describe("applyRateLimit — key derivation", () => {
  it("keys the per-path bucket by user AND pathname, and the global bucket by user alone", async () => {
    await applyRateLimit(
      makeRequest("/api/sites", { "x-siteops-user-id": "u_1" }),
    );

    expect(perPathLimit).toHaveBeenCalledWith("user:u_1:/api/sites");
    // No pathname here — that is the whole point: spraying across ~61 routes
    // must not multiply one identity's budget.
    expect(globalLimit).toHaveBeenCalledWith("user:u_1");
  });

  it("keys both buckets on the client IP for an unauthenticated request", async () => {
    await applyRateLimit(
      makeRequest("/api/auth/sign-in", { "x-forwarded-for": "1.2.3.4, 9.9.9.9" }),
    );

    expect(perPathLimit).toHaveBeenCalledWith("ip:1.2.3.4:/api/auth/sign-in");
    expect(globalLimit).toHaveBeenCalledWith("ip:1.2.3.4");
  });

  it("still prefers the userId over the IP, so shared IPs are not penalised", async () => {
    await applyRateLimit(
      makeRequest("/api/sites", {
        "x-siteops-user-id": "u_2",
        "x-forwarded-for": "1.2.3.4",
      }),
    );

    expect(globalLimit).toHaveBeenCalledWith("user:u_2");
  });
});
