import { describe, expect, it } from "vitest";

import { logicalParent } from "./logicalParent";

// F20. Derived from the real route tree — `find app/app -name page.tsx`. The
// naive "drop the last segment" rule is wrong here: /app/sites/:id/operations
// is not a route, so the parent of an operations page is the site page.
describe("logicalParent", () => {
  it("sends the dashboard to itself", () => {
    expect(logicalParent("/app/dashboard")).toBe("/app/dashboard");
  });

  it("sends a top-level section to the dashboard", () => {
    for (const route of ["/app/sites", "/app/tools", "/app/notifications", "/app/profile"]) {
      expect(logicalParent(route)).toBe("/app/dashboard");
    }
  });

  it("sends every admin page to the dashboard", () => {
    for (const route of [
      "/app/admin/analytics", "/app/admin/approvals", "/app/admin/catalog",
      "/app/admin/data", "/app/admin/expenses", "/app/admin/live-feed", "/app/admin/users",
    ]) {
      expect(logicalParent(route)).toBe("/app/dashboard");
    }
  });

  it("sends both request queues to the dashboard", () => {
    expect(logicalParent("/app/requests/field")).toBe("/app/dashboard");
    expect(logicalParent("/app/requests/resource")).toBe("/app/dashboard");
  });

  it("sends a site page and the new-site form back to the site list", () => {
    expect(logicalParent("/app/sites/abc-123")).toBe("/app/sites");
    expect(logicalParent("/app/sites/new")).toBe("/app/sites");
  });

  it("sends an operations page to its site, NOT to a non-existent /operations route", () => {
    expect(logicalParent("/app/sites/abc-123/operations/labour")).toBe("/app/sites/abc-123");
    expect(logicalParent("/app/sites/abc-123/operations/all")).toBe("/app/sites/abc-123");
  });

  it("sends a category detail page to its operations page", () => {
    expect(logicalParent("/app/sites/abc-123/operations/material/Cement")).toBe(
      "/app/sites/abc-123/operations/material",
    );
  });

  it("sends the category step of the new-log flow back to the type step", () => {
    expect(logicalParent("/app/logs/new/cat-1")).toBe("/app/logs/new");
  });

  it("sends the new-log entry point and the edit page to the dashboard", () => {
    expect(logicalParent("/app/logs/new")).toBe("/app/dashboard");
    expect(logicalParent("/app/logs/entry-9")).toBe("/app/dashboard");
  });

  it("sends the transfer form to the dashboard", () => {
    expect(logicalParent("/app/transfers/new")).toBe("/app/dashboard");
  });

  it("falls back to the dashboard for anything unrecognised", () => {
    for (const route of ["/", "", "/app", "/auth/sign-in", "/nonsense/deep/path"]) {
      expect(logicalParent(route)).toBe("/app/dashboard");
    }
  });

  it("tolerates a trailing slash and repeated slashes", () => {
    expect(logicalParent("/app/sites/abc-123/")).toBe("/app/sites");
    expect(logicalParent("//app//sites//abc-123")).toBe("/app/sites");
  });
});
