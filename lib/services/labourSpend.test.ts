import { describe, expect, it } from "vitest";

import { labourSpend } from "./labourSpend";

describe("labourSpend", () => {
  it("prefers the mason+helper split when either is positive", () => {
    expect(labourSpend({ masonSalaryAmount: "5000", helperSalaryAmount: "3000", salaryAmount: "999", peopleCount: 10, wagePerHead: "1000" })).toBe(8000);
    expect(labourSpend({ masonSalaryAmount: "5000", helperSalaryAmount: null, salaryAmount: "999", peopleCount: 10, wagePerHead: "1000" })).toBe(5000);
    expect(labourSpend({ masonSalaryAmount: null, helperSalaryAmount: "3000", salaryAmount: "999", peopleCount: 10, wagePerHead: "1000" })).toBe(3000);
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
    expect(labourSpend({ masonSalaryAmount: "0", helperSalaryAmount: "0", salaryAmount: "7000" })).toBe(7000);
  });

  it("handles string decimals from drizzle without precision loss on money-sized values", () => {
    expect(labourSpend({ salaryAmount: "1234567.89" })).toBe(1234567.89);
  });
});
