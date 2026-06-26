import { describe, expect, it } from "vitest";

import { splitHighlight } from "@/lib/search/highlight";

describe("splitHighlight", () => {
  it("splits a single case-insensitive match", () => {
    expect(splitHighlight("Work Permit needed", "permit")).toEqual([
      { text: "Work ", match: false },
      { text: "Permit", match: true },
      { text: " needed", match: false },
    ]);
  });

  it("marks every occurrence", () => {
    const parts = splitHighlight("permit and permit", "permit");
    expect(parts.filter((p) => p.match)).toHaveLength(2);
  });

  it("returns whole text as non-match for empty query", () => {
    expect(splitHighlight("anything", "  ")).toEqual([{ text: "anything", match: false }]);
  });

  it("returns empty array for empty text", () => {
    expect(splitHighlight("", "permit")).toEqual([]);
  });

  it("treats query as literal text, never HTML", () => {
    const parts = splitHighlight("a <b> c", "<b>");
    expect(parts).toContainEqual({ text: "<b>", match: true });
  });
});
