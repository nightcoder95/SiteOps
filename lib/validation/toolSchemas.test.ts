import { describe, expect, it } from "vitest";

import { batchSaveSchema, createCategorySchema, createToolSchema } from "./toolSchemas";

const uuid = () => crypto.randomUUID();

describe("createToolSchema", () => {
  it("accepts a valid create body", () => {
    const r = createToolSchema.safeParse({ name: "Manvatti", categoryId: uuid(), openingStock: 5 });
    expect(r.success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(createToolSchema.safeParse({ name: "  ", categoryId: uuid() }).success).toBe(false);
  });

  it("rejects a negative opening stock", () => {
    expect(createToolSchema.safeParse({ name: "X", categoryId: uuid(), openingStock: -1 }).success).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    expect(createToolSchema.safeParse({ name: "X", categoryId: uuid(), total: 5 }).success).toBe(false);
  });
});

describe("batchSaveSchema payload caps (case 12)", () => {
  it("rejects more than 200 tools", () => {
    const tools = Array.from({ length: 201 }, () => ({ toolId: uuid(), version: 0 }));
    expect(batchSaveSchema.safeParse({ tools }).success).toBe(false);
  });

  it("rejects more than 100 assignment rows for one tool", () => {
    const assignments = Array.from({ length: 101 }, () => ({ siteId: uuid(), qty: 1 }));
    expect(batchSaveSchema.safeParse({ tools: [{ toolId: uuid(), version: 0, assignments }] }).success).toBe(false);
  });

  it("allows qty 0 (remove assignment)", () => {
    const r = batchSaveSchema.safeParse({ tools: [{ toolId: uuid(), version: 3, assignments: [{ siteId: uuid(), qty: 0 }] }] });
    expect(r.success).toBe(true);
  });

  it("accepts an empty tools array (no-op batch, case 20)", () => {
    expect(batchSaveSchema.safeParse({ tools: [] }).success).toBe(true);
  });
});

describe("createCategorySchema", () => {
  it("uppercases the code prefix", () => {
    const r = createCategorySchema.parse({ name: "Hand Tool", codePrefix: "hnd" });
    expect(r.codePrefix).toBe("HND");
  });

  it("rejects a non-alphanumeric prefix", () => {
    expect(createCategorySchema.safeParse({ name: "X", codePrefix: "H-D" }).success).toBe(false);
  });
});
