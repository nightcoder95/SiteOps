import { describe, expect, it } from "vitest";

import {
  NAV_STACK_LIMIT,
  parentIsBehind,
  pathnameOf,
  readStack,
  recordReplace,
  recordVisit,
  writeStack,
} from "./navStack";

function fakeStorage(initial: Record<string, string> = {}) {
  const store = { ...initial };
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    dump: () => store,
  };
}

describe("recordVisit", () => {
  it("appends a forward navigation", () => {
    expect(recordVisit([], "/app/dashboard")).toEqual(["/app/dashboard"]);
    expect(recordVisit(["/app/dashboard"], "/app/sites")).toEqual(["/app/dashboard", "/app/sites"]);
  });

  it("ignores a repeat of the current entry (a query-only change)", () => {
    // Applying a filter replaces the URL but not the pathname; the stack must
    // not grow, or the chevron would think the parent moved further away.
    expect(recordVisit(["/app/sites", "/app/sites/s1"], "/app/sites/s1")).toEqual([
      "/app/sites",
      "/app/sites/s1",
    ]);
  });

  it("pops when the user goes back rather than pushing a duplicate", () => {
    expect(recordVisit(["/app/dashboard", "/app/sites", "/app/sites/s1"], "/app/sites")).toEqual([
      "/app/dashboard",
      "/app/sites",
    ]);
  });

  it("caps the stack so a long session cannot grow it without bound", () => {
    const long = Array.from({ length: NAV_STACK_LIMIT }, (_, i) => `/app/p${i}`);
    const next = recordVisit(long, "/app/last");
    expect(next).toHaveLength(NAV_STACK_LIMIT);
    expect(next[next.length - 1]).toBe("/app/last");
    expect(next[0]).toBe("/app/p1");
  });

  it("does not mutate the stack it was given", () => {
    const before = ["/app/dashboard"];
    recordVisit(before, "/app/sites");
    expect(before).toEqual(["/app/dashboard"]);
  });
});

describe("parentIsBehind", () => {
  it("is true when the entry behind the current one is the logical parent", () => {
    expect(parentIsBehind(["/app/sites", "/app/sites/s1"], "/app/sites")).toBe(true);
  });

  it("is false when the user arrived from somewhere else", () => {
    // Reached the site page from a search result, not by drilling down: going
    // back would return to the search origin, so the chevron must push instead.
    expect(parentIsBehind(["/app/dashboard", "/app/sites/s1"], "/app/sites")).toBe(false);
  });

  it("is false on a deep-linked arrival with nothing behind it", () => {
    expect(parentIsBehind(["/app/sites/s1"], "/app/sites")).toBe(false);
    expect(parentIsBehind([], "/app/sites")).toBe(false);
  });
});

describe("readStack / writeStack", () => {
  it("round-trips through storage", () => {
    const storage = fakeStorage();
    writeStack(storage, ["/app/dashboard", "/app/sites"]);
    expect(readStack(storage)).toEqual(["/app/dashboard", "/app/sites"]);
  });

  it("returns an empty stack when nothing is stored", () => {
    expect(readStack(fakeStorage())).toEqual([]);
  });

  it("survives corrupt or non-array stored values instead of throwing", () => {
    expect(readStack(fakeStorage({ "siteops:navStack": "not json" }))).toEqual([]);
    expect(readStack(fakeStorage({ "siteops:navStack": '{"a":1}' }))).toEqual([]);
    expect(readStack(fakeStorage({ "siteops:navStack": '[1,2,3]' }))).toEqual([]);
  });

  it("survives storage that throws (private mode, disabled cookies)", () => {
    const hostile = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(readStack(hostile)).toEqual([]);
    expect(() => writeStack(hostile, ["/app/dashboard"])).not.toThrow();
  });
});

describe("recordReplace", () => {
  it("swaps the top entry instead of stacking a new one", () => {
    // A form that navigates away on success replaces itself, so the submitted
    // form must not stay in the stack — the browser dropped it from history.
    expect(recordReplace(["/app/sites", "/app/sites/new"], "/app/sites/s1")).toEqual([
      "/app/sites",
      "/app/sites/s1",
    ]);
  });

  it("is a no-op when the pathname is unchanged (a filter's query-only replace)", () => {
    const stack = ["/app/sites/s1", "/app/sites/s1/operations/material"];
    expect(recordReplace(stack, "/app/sites/s1/operations/material")).toEqual(stack);
  });

  it("seeds an empty stack", () => {
    expect(recordReplace([], "/app/dashboard")).toEqual(["/app/dashboard"]);
  });

  it("leaves the chevron pushing, never going back to the replaced-away page", () => {
    // The regression this guards: with the form still counted as the entry
    // behind us, the chevron would call back() and land on a page the browser
    // had already discarded.
    const stack = recordReplace(["/app/sites", "/app/sites/new"], "/app/sites/s1");
    expect(parentIsBehind(stack, "/app/sites")).toBe(true);
  });

  it("does not mutate the stack it was given", () => {
    const before = ["/app/sites", "/app/sites/new"];
    recordReplace(before, "/app/sites/s1");
    expect(before).toEqual(["/app/sites", "/app/sites/new"]);
  });
});

describe("pathnameOf", () => {
  it("strips the query and the hash", () => {
    expect(pathnameOf("/app/sites/s1?from=2026-01-01&sort=newest")).toBe("/app/sites/s1");
    expect(pathnameOf("/app/sites/s1#totals")).toBe("/app/sites/s1");
    expect(pathnameOf("/app/sites/s1?a=1#totals")).toBe("/app/sites/s1");
  });

  it("passes a bare pathname through", () => {
    expect(pathnameOf("/app/dashboard")).toBe("/app/dashboard");
  });
});
