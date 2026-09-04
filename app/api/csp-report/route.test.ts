import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLogInfo } = vi.hoisted(() => ({ mockLogInfo: vi.fn() }));

vi.mock("@/lib/logging/log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logging/log")>()),
  logInfo: mockLogInfo,
}));

import { POST } from "./route";

function report(body: unknown, contentType = "application/csp-report") {
  return new NextRequest("http://localhost/api/csp-report", {
    method: "POST",
    headers: { "content-type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function loggedViolation() {
  const call = mockLogInfo.mock.calls.find((c) => c[1] === "csp_violation");
  return call?.[2] as Record<string, unknown> | undefined;
}

const chromeReport = {
  "csp-report": {
    "document-uri": "https://siteops.test/app/dashboard",
    "violated-directive": "script-src",
    "effective-directive": "script-src-elem",
    "blocked-uri": "https://evil.test/x.js",
    disposition: "report",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/csp-report", () => {
  it("accepts a browser report and answers 202 so the browser stops retrying", async () => {
    const response = await POST(report(chromeReport));

    expect(response.status).toBe(202);
  });

  it("logs the directive and the blocked source, which is the whole point", async () => {
    await POST(report(chromeReport));

    expect(loggedViolation()).toMatchObject({
      documentUri: "https://siteops.test/app/dashboard",
      violatedDirective: "script-src",
      effectiveDirective: "script-src-elem",
      blockedUri: "https://evil.test/x.js",
      disposition: "report",
    });
  });

  it("reads the Reporting API shape too, not just the legacy csp-report envelope", async () => {
    await POST(
      report(
        [
          {
            type: "csp-violation",
            body: {
              documentURL: "https://siteops.test/app/sites",
              effectiveDirective: "style-src",
              blockedURL: "https://fonts.googleapis.com/css",
              disposition: "report",
            },
          },
        ],
        "application/reports+json",
      ),
    );

    expect(loggedViolation()).toMatchObject({
      documentUri: "https://siteops.test/app/sites",
      effectiveDirective: "style-src",
      blockedUri: "https://fonts.googleapis.com/css",
    });
  });

  it("never echoes the submitted report back to an unauthenticated caller", async () => {
    const response = await POST(report(chromeReport));
    const text = await response.text();

    expect(text).not.toContain("evil.test");
  });

  it("truncates long fields, so a hostile client cannot write unbounded log lines", async () => {
    await POST(
      report({
        "csp-report": {
          "document-uri": "https://siteops.test/a",
          "violated-directive": "script-src",
          "blocked-uri": `https://evil.test/${"x".repeat(5000)}`,
        },
      }),
    );

    expect(String(loggedViolation()?.blockedUri).length).toBeLessThanOrEqual(256);
  });

  it("rejects an oversized body without parsing it", async () => {
    const response = await POST(report("x".repeat(20_000)));

    expect(response.status).toBe(413);
    expect(loggedViolation()).toBeUndefined();
  });

  it("rejects a body that is not JSON, quietly, without logging a violation", async () => {
    const response = await POST(report("not json at all"));

    expect(response.status).toBe(400);
    expect(loggedViolation()).toBeUndefined();
  });

  it("rejects a JSON body that carries no recognisable report", async () => {
    const response = await POST(report({ hello: "world" }));

    expect(response.status).toBe(400);
    expect(loggedViolation()).toBeUndefined();
  });
});
