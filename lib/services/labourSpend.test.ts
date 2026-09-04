import { describe, expect, it } from "vitest";

import { labourSpend } from "./labourSpend";

describe("labourSpend", () => {
  it("multiplies each split role's head count by its per-person wage", () => {
    // The reported bug: 2 masons at ₹1,300 and 2 helpers at ₹1,100 cost ₹4,800,
    // not the ₹2,400 that summing the two wages produces.
    expect(labourSpend({
      masonCount: 2,
      masonSalaryAmount: "1300",
      helperCount: 2,
      helperSalaryAmount: "1100",
    })).toBe(4800);
  });

  it("prefers the mason+helper split when either role has a positive cost", () => {
    expect(labourSpend({ masonCount: 2, masonSalaryAmount: "5000", helperCount: 3, helperSalaryAmount: "3000", salaryAmount: "999", peopleCount: 10, wagePerHead: "1000" })).toBe(19000);
    expect(labourSpend({ masonCount: 1, masonSalaryAmount: "5000", helperCount: null, helperSalaryAmount: null, salaryAmount: "999", peopleCount: 10, wagePerHead: "1000" })).toBe(5000);
    expect(labourSpend({ masonCount: null, masonSalaryAmount: null, helperCount: 3, helperSalaryAmount: "3000", salaryAmount: "999", peopleCount: 10, wagePerHead: "1000" })).toBe(9000);
  });

  it("costs a role with no people at zero, however large its per-person wage", () => {
    // A wage without a head count buys nothing. Validation now rejects this
    // pairing on write; rows already stored this way must read as 0, not as the
    // bare wage.
    expect(labourSpend({ masonCount: 0, masonSalaryAmount: "1300" })).toBe(0);
    expect(labourSpend({ masonCount: null, masonSalaryAmount: "1300" })).toBe(0);
  });

  it("falls back to the stored salaryAmount when the split is zero/absent", () => {
    expect(labourSpend({ salaryAmount: "12345", peopleCount: 10, wagePerHead: "1000" })).toBe(12345);
  });

  it("falls back to peopleCount × wagePerHead when nothing is stored", () => {
    expect(labourSpend({ peopleCount: 10, wagePerHead: "1000.00" })).toBe(10000);
  });

  it("returns 0 when there is nothing to compute from", () => {
    expect(labourSpend({})).toBe(0);
    expect(labourSpend({ peopleCount: 10, wagePerHead: null })).toBe(0);
    expect(labourSpend({ peopleCount: null, wagePerHead: "1000" })).toBe(0);
  });

  it("treats a zero split as absent, not as a spend of 0", () => {
    // A row with explicit zeros in both split columns must fall through to the
    // stored salary — otherwise editing a split entry to zeros would zero the
    // reported spend while the salary column still holds a value.
    expect(labourSpend({ masonCount: 0, masonSalaryAmount: "0", helperCount: 0, helperSalaryAmount: "0", salaryAmount: "7000" })).toBe(7000);
  });

  it("handles string decimals from drizzle without precision loss on money-sized values", () => {
    expect(labourSpend({ salaryAmount: "1234567.89" })).toBe(1234567.89);
    expect(labourSpend({ masonCount: 3, masonSalaryAmount: "1234.56" })).toBeCloseTo(3703.68, 2);
  });
});
