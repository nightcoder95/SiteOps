import { beforeEach, describe, expect, it, vi } from "vitest";

import { materialUnitRuleFor } from "./materialUnitRule";

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }));

vi.mock("@/lib/db/client", () => ({ db: { select: mockSelect } }));

// Chains, in call order: 1) active units, 2) subcategory lookup, 3) mapped units.
function chainActive(rows: unknown[]) {
  return { from: () => ({ where: () => ({ orderBy: () => Promise.resolve(rows) }) }) };
}
function chainSub(rows: unknown[]) {
  return { from: () => ({ innerJoin: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }) }) };
}
function chainMapped(rows: unknown[]) {
  return { from: () => ({ innerJoin: () => ({ where: () => Promise.resolve(rows) }) }) };
}

describe("materialUnitRuleFor (DB-backed)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns the mapped allow-list for a material type that has one", async () => {
    mockSelect
      .mockReturnValueOnce(chainActive([{ label: "Bag" }, { label: "KG" }, { label: "Tonne" }]))
      .mockReturnValueOnce(chainSub([{ subcategoryId: "s1" }]))
      .mockReturnValueOnce(chainMapped([{ label: "Bag", isDefault: true }]));

    const rule = await materialUnitRuleFor("Cement");
    expect(rule.allowedNames).toEqual(["Bag"]);
    expect(rule.preferredName).toBe("Bag");
  });

  it("falls back to all active units when the material type has no mapping", async () => {
    mockSelect
      .mockReturnValueOnce(chainActive([{ label: "Tonne" }, { label: "Litre" }]))
      .mockReturnValueOnce(chainSub([{ subcategoryId: "s1" }]))
      .mockReturnValueOnce(chainMapped([]));

    const rule = await materialUnitRuleFor("Unmapped");
    expect(rule.allowedNames).toEqual(["Tonne", "Litre"]);
    expect(rule.preferredName).toBe("Tonne");
  });

  it("falls back to all active units when the subcategory does not exist", async () => {
    mockSelect
      .mockReturnValueOnce(chainActive([{ label: "Tonne" }, { label: "Litre" }]))
      .mockReturnValueOnce(chainSub([]));

    const rule = await materialUnitRuleFor("Ghost");
    expect(rule.allowedNames).toEqual(["Tonne", "Litre"]);
  });

  it("falls back without a subcategory lookup for an empty material type", async () => {
    mockSelect.mockReturnValueOnce(chainActive([{ label: "Tonne" }]));
    const rule = await materialUnitRuleFor("");
    expect(rule.allowedNames).toEqual(["Tonne"]);
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });
});
