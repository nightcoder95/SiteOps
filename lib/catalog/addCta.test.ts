import { describe, expect, it } from "vitest";

import { addCtaLabel } from "./addCta";

describe("addCtaLabel", () => {
  it("prefixes the noun with Add", () => {
    expect(addCtaLabel("Work Type")).toBe("Add Work Type");
    expect(addCtaLabel("Unit")).toBe("Add Unit");
  });
});
