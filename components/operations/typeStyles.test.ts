import { describe, expect, it } from "vitest";

import { getTypeSolidColor } from "./typeStyles";

describe("getTypeSolidColor", () => {
  it("returns a solid, high-contrast fill for each spend type", () => {
    expect(getTypeSolidColor("labour")).toContain("bg-sky-500");
    expect(getTypeSolidColor("material")).toContain("bg-emerald-500");
    expect(getTypeSolidColor("machinery")).toContain("bg-slate-400");
    expect(getTypeSolidColor("expense")).toContain("bg-amber-500");
  });

  it("pairs the solid fill with a dark foreground for contrast", () => {
    expect(getTypeSolidColor("labour")).toContain("text-slate-950");
  });
});
