import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { logicalParent } from "./logicalParent";

// The chevron sends users to logicalParent(). If that names a route which does
// not exist — or one that was deleted and left behind a notFound() stub — the
// user lands on a 404 with no way back except the footer nav.
//
// That is exactly what happened to /app/sites: the route was removed in favour
// of the dashboard (SitesCard/SiteRow/ArchivedSites all live under
// app/app/dashboard), every link to it was cleaned up, and this map was the one
// reference left behind. So this suite derives the truth from the filesystem
// instead of restating the map — a route removed tomorrow fails here.
const appRoot = path.resolve(__dirname, "..", "..", "app", "app");

/** Route patterns that have a page, e.g. "/app/sites/[id]/operations/[type]". */
function routePatterns(): string[] {
  const out: string[] = [];
  const stack: string[] = [appRoot];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;
    for (const name of readdirSync(dir)) {
      const abs = path.join(dir, name);
      if (statSync(abs).isDirectory()) {
        stack.push(abs);
        continue;
      }
      if (name !== "page.tsx") continue;
      const rel = path.relative(appRoot, dir).split(path.sep).filter(Boolean);
      out.push(["/app", ...rel].join("/"));
    }
  }
  return out;
}

/**
 * A page whose whole body is notFound() is a tombstone for a removed route, not
 * a destination. Route groups and role gates call notFound() too, so this looks
 * for the deliberately tiny stub rather than any mention of it.
 */
function isRemovedStub(pattern: string): boolean {
  const file = path.join(appRoot, pattern.replace(/^\/app\/?/, ""), "page.tsx");
  const source = readFileSync(file, "utf8");
  return /notFound\(\)/.test(source) && source.split("\n").filter((l) => l.trim()).length < 8;
}

const SAMPLE: Record<string, string> = {
  "[id]": "abc-123",
  "[type]": "material",
  "[category]": "Cement",
  "[entryId]": "entry-9",
  "[categoryId]": "cat-1",
};

function concretise(pattern: string): string {
  return pattern
    .split("/")
    .map((seg) => SAMPLE[seg] ?? seg)
    .join("/");
}

function patternToRegExp(pattern: string): RegExp {
  const body = pattern
    .split("/")
    .map((seg) => (seg.startsWith("[") ? "[^/]+" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("/");
  return new RegExp(`^${body}$`);
}

describe("logicalParent destinations", () => {
  const patterns = routePatterns();

  it("finds the route tree it is meant to check", () => {
    expect(patterns).toContain("/app/dashboard");
    expect(patterns.length).toBeGreaterThan(15);
  });

  it("never sends the user to a route that does not exist", () => {
    const live = patterns.filter((p) => !isRemovedStub(p)).map(patternToRegExp);
    const broken = patterns
      .map((pattern) => ({ pattern, parent: logicalParent(concretise(pattern)) }))
      .filter(({ parent }) => !live.some((re) => re.test(parent)));

    expect(broken).toEqual([]);
  });

  it("never sends the user to a removed route's notFound() stub", () => {
    const tombstones = patterns.filter(isRemovedStub).map(patternToRegExp);
    const broken = patterns
      .map((pattern) => ({ pattern, parent: logicalParent(concretise(pattern)) }))
      .filter(({ parent }) => tombstones.some((re) => re.test(parent)));

    expect(broken).toEqual([]);
  });
});
