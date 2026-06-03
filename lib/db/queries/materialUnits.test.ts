import { describe, expect, it } from "vitest";

import {
  allowedMaterialUnitNames,
  displayUnitName,
  materialUnitRuleFor,
} from "./materialUnits";

describe("material unit rules", () => {
  it("maps Cement to Bag", () => {
    expect(materialUnitRuleFor("Cement")).toEqual({ allowedNames: ["Bag"], preferredName: "Bag" });
  });

  it("maps sand and Metal to CFT", () => {
    expect(materialUnitRuleFor("M sand").preferredName).toBe("CFT");
    expect(materialUnitRuleFor("P sand").preferredName).toBe("CFT");
    expect(materialUnitRuleFor("Metal").preferredName).toBe("CFT");
  });

  it("maps Steel to KG", () => {
    expect(materialUnitRuleFor("Steel").preferredName).toBe("KG");
  });

  it("maps bricks and cement blocks to Numbers", () => {
    expect(materialUnitRuleFor("Red Brick").preferredName).toBe("Numbers");
    expect(materialUnitRuleFor("Cement Block 6in").preferredName).toBe("Numbers");
    expect(materialUnitRuleFor("Cement Block 4in").preferredName).toBe("Numbers");
  });

  it("allows only Tonne and Litre for custom material", () => {
    expect(allowedMaterialUnitNames("Custom Aggregate")).toEqual(["Tonne", "Litre"]);
  });

  it("normalizes existing master unit labels for display", () => {
    expect(displayUnitName("Bag (50 kg)")).toBe("Bag");
    expect(displayUnitName("Kilogram")).toBe("KG");
    expect(displayUnitName("Nos")).toBe("Numbers");
  });
});
