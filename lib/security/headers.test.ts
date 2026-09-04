import { describe, expect, it } from "vitest";

import { buildSecurityHeaders } from "@/lib/security/headers";

function headerValue(name: string): string | undefined {
  return buildSecurityHeaders().find((h) => h.key === name)?.value;
}

describe("Strict-Transport-Security (S5)", () => {
  it("is sent, so a first visit over http:// on a custom domain cannot be downgraded", () => {
    expect(headerValue("Strict-Transport-Security")).toBeDefined();
  });

  it("uses a two-year max-age and covers subdomains", () => {
    expect(headerValue("Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains",
    );
  });

  it("omits preload, which is a one-way door out of our control", () => {
    expect(headerValue("Strict-Transport-Security")).not.toContain("preload");
  });
});

function directives(): Map<string, string> {
  const csp = headerValue("Content-Security-Policy-Report-Only") ?? "";
  return new Map(
    csp.split(";").map((part) => {
      const [name, ...rest] = part.trim().split(/\s+/);
      return [name, rest.join(" ")];
    }),
  );
}

describe("Content-Security-Policy (S1)", () => {
  it("stays report-only until a full week of real violation data says otherwise", () => {
    // Flipping to enforcing without report data is how you white-screen an
    // installed PWA. Phase 7 Task 9 owns that change.
    expect(headerValue("Content-Security-Policy")).toBeUndefined();
    expect(headerValue("Content-Security-Policy-Report-Only")).toBeDefined();
  });

  it("no longer allows 'unsafe-eval' — nothing in this stack needs it", () => {
    expect(directives().get("script-src")).not.toContain("unsafe-eval");
  });

  it("still allows 'unsafe-inline' for scripts, which Next's hydration payload requires", () => {
    expect(directives().get("script-src")).toContain("'unsafe-inline'");
  });

  it("blocks plugin content outright with object-src 'none'", () => {
    expect(directives().get("object-src")).toBe("'none'");
  });

  it("confines the service worker to this origin", () => {
    expect(directives().get("worker-src")).toBe("'self'");
  });

  it("no longer allows Google Fonts, which Phase 6 removed in favour of self-hosted Inter", () => {
    const csp = headerValue("Content-Security-Policy-Report-Only") ?? "";
    expect(csp).not.toContain("fonts.googleapis.com");
    expect(csp).not.toContain("fonts.gstatic.com");
  });

  it("still allows inline styles, which Tailwind and React style props emit", () => {
    expect(directives().get("style-src")).toContain("'unsafe-inline'");
  });

  it("keeps the connect-src allowances the app actually uses", () => {
    const connect = directives().get("connect-src") ?? "";
    expect(connect).toContain("'self'");
    expect(connect).toContain("https://*.upstash.io");
  });

  it("reports violations somewhere, via both the modern and the legacy channel", () => {
    const csp = headerValue("Content-Security-Policy-Report-Only") ?? "";
    expect(csp).toContain("report-uri /api/csp-report");
    expect(csp).toContain("report-to csp-endpoint");
  });

  it("declares the reporting endpoint the report-to group names", () => {
    expect(headerValue("Reporting-Endpoints")).toBe(
      'csp-endpoint="/api/csp-report"',
    );
  });

  it("keeps the framing and injection floors that were already there", () => {
    const d = directives();
    expect(d.get("default-src")).toBe("'self'");
    expect(d.get("frame-ancestors")).toBe("'none'");
    expect(d.get("base-uri")).toBe("'self'");
    expect(d.get("form-action")).toBe("'self'");
  });
});
