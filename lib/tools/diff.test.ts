import { describe, expect, it } from "vitest";

import { diffAssignments } from "./diff";

describe("diffAssignments", () => {
  it("inserts a new site assignment → assign movement", () => {
    const d = diffAssignments([], [{ siteId: "a", qty: 5 }]);
    expect(d.inserts).toEqual([{ siteId: "a", qty: 5 }]);
    expect(d.updates).toEqual([]);
    expect(d.deletes).toEqual([]);
    expect(d.movements).toEqual([{ kind: "assign", siteId: "a", qty: 5 }]);
  });

  it("updates a changed qty upward → assign delta", () => {
    const d = diffAssignments([{ siteId: "a", qty: 3 }], [{ siteId: "a", qty: 8 }]);
    expect(d.updates).toEqual([{ siteId: "a", qty: 8 }]);
    expect(d.movements).toEqual([{ kind: "assign", siteId: "a", qty: 5 }]);
  });

  it("updates a changed qty downward → return delta", () => {
    const d = diffAssignments([{ siteId: "a", qty: 8 }], [{ siteId: "a", qty: 3 }]);
    expect(d.updates).toEqual([{ siteId: "a", qty: 3 }]);
    expect(d.movements).toEqual([{ kind: "return", siteId: "a", qty: 5 }]);
  });

  it("qty→0 removes the assignment + return movement (case 17)", () => {
    const d = diffAssignments([{ siteId: "a", qty: 4 }], [{ siteId: "a", qty: 0 }]);
    expect(d.deletes).toEqual(["a"]);
    expect(d.updates).toEqual([]);
    expect(d.movements).toEqual([{ kind: "return", siteId: "a", qty: 4 }]);
  });

  it("site omitted from desired → delete + full return (case 17 / §6)", () => {
    const d = diffAssignments([{ siteId: "a", qty: 4 }], []);
    expect(d.deletes).toEqual(["a"]);
    expect(d.movements).toEqual([{ kind: "return", siteId: "a", qty: 4 }]);
  });

  it("unchanged qty yields no movement", () => {
    const d = diffAssignments([{ siteId: "a", qty: 4 }], [{ siteId: "a", qty: 4 }]);
    expect(d.movements).toEqual([]);
    expect(d.inserts).toEqual([]);
    expect(d.updates).toEqual([]);
    expect(d.deletes).toEqual([]);
  });
});
