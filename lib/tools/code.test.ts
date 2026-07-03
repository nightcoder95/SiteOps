import { describe, expect, it } from "vitest";

import { nextToolCode, parseSequence } from "./code";

describe("nextToolCode", () => {
  it("starts at 001 when no existing sequences", () => {
    expect(nextToolCode("HND", [])).toBe("HND-001");
  });

  it("increments from the max existing sequence", () => {
    expect(nextToolCode("PWR", [1, 2, 3])).toBe("PWR-004");
  });

  it("is gap-tolerant: does not renumber into a gap", () => {
    expect(nextToolCode("HND", [1, 3])).toBe("HND-004"); // max(3)+1, not 2
  });

  it("zero-pads to 3 digits and grows past 999", () => {
    expect(nextToolCode("EQP", [11])).toBe("EQP-012");
    expect(nextToolCode("EQP", [999])).toBe("EQP-1000");
  });
});

describe("parseSequence", () => {
  it("extracts the numeric sequence for a matching prefix", () => {
    expect(parseSequence("HND", "HND-004")).toBe(4);
  });

  it("returns null for a non-matching prefix", () => {
    expect(parseSequence("HND", "PWR-004")).toBeNull();
  });
});
