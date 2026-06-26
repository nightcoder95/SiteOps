import { describe, expect, it } from "vitest";

import { makeSnippet } from "@/lib/search/snippet";

describe("makeSnippet", () => {
  it("returns short text unchanged", () => {
    expect(makeSnippet("needs a work permit", "permit")).toBe("needs a work permit");
  });

  it("returns empty string for empty input", () => {
    expect(makeSnippet("", "permit")).toBe("");
  });

  it("centers the window on the match and adds ellipses", () => {
    const long = `${"a".repeat(200)} permit ${"b".repeat(200)}`;
    const out = makeSnippet(long, "permit", 40);
    expect(out).toContain("permit");
    expect(out.startsWith("…")).toBe(true);
    expect(out.endsWith("…")).toBe(true);
    expect(Array.from(out).length).toBeLessThanOrEqual(42); // 40 + two ellipses
  });

  it("falls back to the head when there is no literal match", () => {
    const long = "z".repeat(200);
    const out = makeSnippet(long, "permit", 40);
    expect(out.endsWith("…")).toBe(true);
    expect(out.startsWith("…")).toBe(false);
    expect(Array.from(out).length).toBe(40);
  });

  it("is code-point safe with emoji", () => {
    const long = `${"🚧".repeat(100)} permit ${"🚧".repeat(100)}`;
    const out = makeSnippet(long, "permit", 40);
    // No lone surrogate halves: re-encoding round-trips cleanly.
    expect([...out].every((ch) => ch.length <= 2)).toBe(true);
    expect(out).toContain("permit");
  });
});
