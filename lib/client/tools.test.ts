import { describe, expect, it } from "vitest";

import { reconcileTools, type BatchResult, type ToolDTO } from "./tools";

const tool = (over: Partial<ToolDTO>): ToolDTO => ({
  toolId: "t",
  name: "T",
  code: "HND-001",
  categoryId: "c",
  totalQuantity: 10,
  icon: null,
  version: 1,
  free: 10,
  assignments: [],
  ...over,
});

describe("reconcileTools", () => {
  it("replaces conflicted/invalid tools with fresh server state, leaves others", () => {
    const current = [tool({ toolId: "a", version: 1 }), tool({ toolId: "b", version: 1 })];
    const results: BatchResult[] = [
      { toolId: "a", status: "conflict", tool: tool({ toolId: "a", version: 5, totalQuantity: 20 }) },
    ];
    const next = reconcileTools(current, results);
    expect(next[0].version).toBe(5);
    expect(next[0].totalQuantity).toBe(20);
    expect(next[1].version).toBe(1); // untouched
  });
});
