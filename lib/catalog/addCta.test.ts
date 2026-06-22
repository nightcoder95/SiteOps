import { describe, expect, it } from "vitest";

import { addCtaLabel, catalogNounForCategory } from "./addCta";

describe("catalogNounForCategory", () => {
  it("maps operation categories to their type noun", () => {
    expect(catalogNounForCategory("Labour")).toBe("Work Type");
    expect(catalogNounForCategory("Materials")).toBe("Material Type");
    expect(catalogNounForCategory("Machinery/Equipment")).toBe("Equipment Type");
  });

  it("maps attribute-list categories to their short noun", () => {
    expect(catalogNounForCategory("Material Work Stage")).toBe("Work Stage");
    expect(catalogNounForCategory("Incident Severity")).toBe("Severity");
    expect(catalogNounForCategory("Expense Category")).toBe("Expense Category");
    expect(catalogNounForCategory("Incident Type")).toBe("Incident Type");
  });

  it("falls back to the category name for unknown lists", () => {
    expect(catalogNounForCategory("Custom List")).toBe("Custom List");
  });

  it("trims and tolerates surrounding whitespace", () => {
    expect(catalogNounForCategory("  Labour  ")).toBe("Work Type");
  });
});

describe("addCtaLabel", () => {
  it("prefixes the noun with Add", () => {
    expect(addCtaLabel("Work Type")).toBe("Add Work Type");
    expect(addCtaLabel("Unit")).toBe("Add Unit");
  });
});
