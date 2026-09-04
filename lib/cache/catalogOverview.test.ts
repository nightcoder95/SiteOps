import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { catalogOverviewCacheKey } from "./keys";

describe("catalogOverviewCacheKey", () => {
  it("is a single global key — the overview is not per-user or per-site", () => {
    expect(catalogOverviewCacheKey()).toBe("admin:catalogOverview");
  });

  it("is stable across calls", () => {
    expect(catalogOverviewCacheKey()).toBe(catalogOverviewCacheKey());
  });
});

describe("catalog overview invalidation coverage", () => {
  // Every route that mutates what GET /api/admin/catalog returns must clear the
  // cache, or admins stare at stale usage counts for up to a TTL after their
  // own edit. Grep-level because three of these routes have no route test yet
  // (see Phase 4 / F11).
  const writeRoutes = [
    "app/api/forms/subcategories/route.ts",
    "app/api/forms/subcategories/[id]/route.ts",
    "app/api/admin/catalog/merge/route.ts",
    "app/api/forms/categories/route.ts",
    "app/api/forms/categories/[id]/route.ts",
  ];

  it.each(writeRoutes)("%s invalidates the catalog overview cache", (rel) => {
    const source = readFileSync(path.resolve(__dirname, "..", "..", rel), "utf8");
    expect(source).toContain("invalidateCatalogOverviewCache");
  });
});
