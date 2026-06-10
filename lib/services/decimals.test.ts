import { describe, expect, it } from "vitest";

import { coerceDecimals } from "./decimals";

describe("coerceDecimals", () => {
  it("stringifies only the listed numeric keys", () => {
    const out = coerceDecimals({ amount: 12.5, qty: 3, note: "x" }, ["amount", "qty"]);
    expect(out.amount).toBe("12.5");
    expect(out.qty).toBe("3");
    expect(out.note).toBe("x");
  });

  it("leaves non-numbers and absent keys untouched", () => {
    const out = coerceDecimals(
      { amount: "already", missing: undefined as unknown, nil: null },
      ["amount", "missing", "nil", "ghost"],
    );
    expect(out.amount).toBe("already");
    expect(out.missing).toBeUndefined();
    expect(out.nil).toBeNull();
  });

  it("handles zero (a real numeric value)", () => {
    const out = coerceDecimals({ cost: 0 }, ["cost"]);
    expect(out.cost).toBe("0");
  });
});
