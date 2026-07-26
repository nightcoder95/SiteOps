import { describe, expect, it } from "vitest";

import { batchSaveSchema, createCategorySchema, createToolSchema, toolMovementSchema } from "./toolSchemas";

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

describe("toolMovementSchema", () => {
  it("validates send_to_site action", () => {
    const valid = toolMovementSchema.safeParse({
      kind: "send_to_site",
      targetSiteId: uuid(),
      quantity: 5,
      note: "Sent with Sasi",
    });
    expect(valid.success).toBe(true);
  });

  it("validates return_to_godown action", () => {
    const valid = toolMovementSchema.safeParse({
      kind: "return_to_godown",
      fromSiteId: uuid(),
      quantity: 2,
    });
    expect(valid.success).toBe(true);
  });

  it("validates transfer_site action", () => {
    const valid = toolMovementSchema.safeParse({
      kind: "transfer_site",
      fromSiteId: uuid(),
      targetSiteId: uuid(),
      quantity: 3,
    });
    expect(valid.success).toBe(true);
  });

  it("validates add_stock and remove_stock actions", () => {
    expect(toolMovementSchema.safeParse({ kind: "add_stock", quantity: 10 }).success).toBe(true);
    expect(toolMovementSchema.safeParse({ kind: "remove_stock", quantity: 1 }).success).toBe(true);
  });

  it("rejects non-positive quantity", () => {
    const invalid = toolMovementSchema.safeParse({
      kind: "send_to_site",
      targetSiteId: uuid(),
      quantity: 0,
    });
    expect(invalid.success).toBe(false);
  });

  it("requires targetSiteId for send_to_site", () => {
    const invalid = toolMovementSchema.safeParse({
      kind: "send_to_site",
      quantity: 2,
    });
    expect(invalid.success).toBe(false);
  });

  it("rejects unknown kind", () => {
    const invalid = toolMovementSchema.safeParse({
      kind: "invalid_kind",
      quantity: 1,
    });
    expect(invalid.success).toBe(false);
  });
});

