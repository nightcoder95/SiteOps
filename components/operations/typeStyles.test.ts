import { describe, expect, it } from "vitest";

import { getTypeActiveGlowColor, getTypeDotColor } from "./typeStyles";

describe("typeStyles Option 1 Glowing Glass", () => {
  it("returns glowing glass active styling for each spend type", () => {
    expect(getTypeActiveGlowColor("labour")).toContain("bg-sky-500/15");
    expect(getTypeActiveGlowColor("material")).toContain("bg-emerald-500/15");
    expect(getTypeActiveGlowColor("machinery")).toContain("bg-violet-500/15");
    expect(getTypeActiveGlowColor("expense")).toContain("bg-amber-500/15");
  });

  it("returns glowing status dot colors for each spend type", () => {
    expect(getTypeDotColor("labour")).toContain("bg-sky-400");
    expect(getTypeDotColor("material")).toContain("bg-emerald-400");
    expect(getTypeDotColor("machinery")).toContain("bg-violet-400");
    expect(getTypeDotColor("expense")).toContain("bg-amber-400");
  });
});
