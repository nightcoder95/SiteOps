import { describe, expect, it } from "vitest";

import { validateDistribution } from "./invariant";

const isOk = (r: ReturnType<typeof validateDistribution>) => r.ok === true;

describe("validateDistribution", () => {
  it("accepts a valid distribution (Σ < total leaves free)", () => {
    const r = validateDistribution({
      totalQuantity: 20,
      assignments: [
        { siteId: "a", qty: 8 },
        { siteId: "b", qty: 5 },
      ],
    });
    expect(isOk(r)).toBe(true);
  });

  it("accepts Σ === total (free = 0)", () => {
    expect(isOk(validateDistribution({ totalQuantity: 10, assignments: [{ siteId: "a", qty: 10 }] }))).toBe(true);
  });

  it("accepts empty assignments", () => {
    expect(isOk(validateDistribution({ totalQuantity: 5, assignments: [] }))).toBe(true);
  });

  it("rejects Σ > total → sum_exceeds_total (case 1, 13)", () => {
    expect(validateDistribution({ totalQuantity: 5, assignments: [{ siteId: "a", qty: 6 }] })).toEqual({
      ok: false,
      reason: "sum_exceeds_total",
    });
  });

  it("rejects zero qty → non_positive_qty (case 3)", () => {
    expect(validateDistribution({ totalQuantity: 5, assignments: [{ siteId: "a", qty: 0 }] })).toEqual({
      ok: false,
      reason: "non_positive_qty",
    });
  });

  it("rejects negative qty → non_positive_qty (case 3)", () => {
    expect(validateDistribution({ totalQuantity: 5, assignments: [{ siteId: "a", qty: -2 }] })).toEqual({
      ok: false,
      reason: "non_positive_qty",
    });
  });

  it("rejects fractional qty → non_integer (case 3)", () => {
    expect(validateDistribution({ totalQuantity: 5, assignments: [{ siteId: "a", qty: 1.5 }] })).toEqual({
      ok: false,
      reason: "non_integer",
    });
  });

  it("rejects negative total → negative_total", () => {
    expect(validateDistribution({ totalQuantity: -1, assignments: [] })).toEqual({
      ok: false,
      reason: "negative_total",
    });
  });

  it("rejects fractional total → non_integer", () => {
    expect(validateDistribution({ totalQuantity: 5.5, assignments: [] })).toEqual({
      ok: false,
      reason: "non_integer",
    });
  });

  it("rejects duplicate siteId → duplicate_site (case 4)", () => {
    expect(
      validateDistribution({
        totalQuantity: 20,
        assignments: [
          { siteId: "a", qty: 3 },
          { siteId: "a", qty: 4 },
        ],
      }),
    ).toEqual({ ok: false, reason: "duplicate_site" });
  });
});
