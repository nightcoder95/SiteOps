import { describe, expect, it } from "vitest";

import { clampInt } from "@/lib/utils/clampInt";

describe("clampInt", () => {
  it("returns the default for null", () => {
    expect(clampInt(null, 7, 1, 50)).toBe(7);
  });

  it("returns the default for non-numeric input", () => {
    expect(clampInt("abc", 7, 1, 50)).toBe(7);
  });

  it("clamps above the max", () => {
    expect(clampInt("999", 7, 1, 50)).toBe(50);
  });

  it("clamps below the min", () => {
    expect(clampInt("-5", 7, 1, 50)).toBe(1);
  });

  it("passes through an in-range value", () => {
    expect(clampInt("20", 7, 1, 50)).toBe(20);
  });
});
