import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const MODULE = "@/lib/rateLimit/upstash";

/**
 * The limiter is constructed at module scope from env, so every case has to
 * reset the module registry and re-import with the env it wants.
 */
async function importWithEnv(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value as string);
  }
  return (await import(MODULE)).upstashRateLimit;
}

// `ctx` is `protected` on Ratelimit (a compile-time marker only); the cache it
// holds is the object under test, so reach it deliberately rather than
// asserting on a mock.
function ephemeralMapOf(limiter: unknown): Map<string, number> | undefined {
  return (limiter as { ctx?: { cache?: { cache?: Map<string, number> } } }).ctx
    ?.cache?.cache;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("upstashRateLimit", () => {
  it("is null without Upstash env, so dev and test stay unlimited", async () => {
    const limiter = await importWithEnv({
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
    });

    expect(limiter).toBeNull();
  });

  it("is constructed with a module-level ephemeral cache when env is present", async () => {
    const limiter = await importWithEnv({
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "test-token",
    });

    expect(limiter).not.toBeNull();
    expect(ephemeralMapOf(limiter)).toBeInstanceOf(Map);
  });

  it("rejects an already-blocked identifier from the ephemeral cache without calling Redis", async () => {
    const limiter = await importWithEnv({
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "test-token",
    });

    // Seed the cache the way a real over-limit response would: identifier ->
    // reset timestamp in the future. If the limiter consults the cache, this
    // resolves with no network; the fake REST URL guarantees a network attempt
    // would fail instead.
    // Keys are namespaced with the limiter's default prefix before they reach
    // the cache, so seed the prefixed form.
    const identifier = "user:blocked:/api/forms/categories";
    const cache = ephemeralMapOf(limiter);
    const reset = Date.now() + 60_000;
    cache?.set(`@upstash/ratelimit:${identifier}`, reset);

    const result = await limiter!.limit(identifier);

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
    // The limit reported on the short-circuit path is the configured token
    // count — this is what pins the window size at 60 requests.
    expect(result.limit).toBe(60);
  });

  it("still configures slidingWindow(60, '1 m') with analytics — the cache must not loosen the limit", () => {
    const source = readFileSync(
      path.join(process.cwd(), "lib/rateLimit/upstash.ts"),
      "utf8",
    );

    expect(source).toContain('Ratelimit.slidingWindow(60, "1 m")');
    expect(source).toContain("analytics: true");
  });
});

describe("fail-open alarm (S3)", () => {
  /**
   * Fail-open is deliberate — a Redis outage must not take the API down — but a
   * missing env var in production disables ALL rate limiting with nothing in the
   * logs. These cases fence the one line that makes that failure audible.
   */
  async function importWithSpy(env: Record<string, string | undefined>) {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.resetModules();
    for (const [key, value] of Object.entries(env)) {
      vi.stubEnv(key, value as string);
    }
    await import(MODULE);
    return spy;
  }

  it("logs an error when the limiter is unconfigured in production", async () => {
    const spy = await importWithSpy({
      NODE_ENV: "production",
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0]?.[0])).toContain("[rate-limit]");
    expect(String(spy.mock.calls[0]?.[0])).toContain("UPSTASH_REDIS_REST_URL");
    spy.mockRestore();
  });

  it("stays quiet in production when the limiter is configured", async () => {
    const spy = await importWithSpy({
      NODE_ENV: "production",
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "test-token",
    });

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("stays quiet outside production, where being unlimited is expected", async () => {
    const spy = await importWithSpy({
      NODE_ENV: "development",
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
    });

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
