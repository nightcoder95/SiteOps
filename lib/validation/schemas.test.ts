import { describe, expect, it } from "vitest";

import {
  entryDateSchema,
  incidentEntrySchema,
  labourEntrySchema,
  labourSplitWorkTypes,
  machineryEntrySchema,
  materialEntrySchema,
  materialWorkStages,
  updateIncidentEntrySchema,
  updateLabourEntrySchema,
  updateMachineryEntrySchema,
  updateMaterialEntrySchema,
} from "@/lib/validation/schemas";

const validSiteId = "550e8400-e29b-41d4-a716-446655440000";
const validTypeId = "550e8400-e29b-41d4-a716-446655440001";
const validUnitId = "550e8400-e29b-41d4-a716-446655440002";
const validEntryDate = new Date().toISOString().slice(0, 10);

describe("incident schemas", () => {
  it("accepts valid incident create payload", () => {
    const result = incidentEntrySchema.safeParse({
      siteId: validSiteId,
      incidentType: "Safety",
      severity: "High",
      description: "Scaffolding issue",
      durationEstimate: 120,
    });

    expect(result.success).toBe(true);
  });

  it("allows patch payload without siteId", () => {
    const result = updateIncidentEntrySchema.safeParse({
      description: "Updated detail",
      severity: "Low",
    });

    expect(result.success).toBe(true);
  });

  it("rejects negative duration", () => {
    const result = updateIncidentEntrySchema.safeParse({
      durationEstimate: -1,
    });

    expect(result.success).toBe(false);
  });
});

describe("labour schemas", () => {
  it("requires wagePerHead on create", () => {
    const result = labourEntrySchema.safeParse({
      siteId: validSiteId,
      date: validEntryDate,
      peopleCount: 8,
      workTypeMode: "default_enum",
      workTypeEnum: "Brick work",
    });

    expect(result.success).toBe(false);
  });

  it("accepts valid wagePerHead on create", () => {
    const result = labourEntrySchema.safeParse({
      siteId: validSiteId,
      date: validEntryDate,
      peopleCount: 8,
      wagePerHead: 650.5,
      workTypeMode: "default_enum",
      workTypeEnum: "Brick work",
    });

    expect(result.success).toBe(true);
  });

  it("accepts wagePerHead with valid 2 decimal places", () => {
    const result = labourEntrySchema.safeParse({
      siteId: validSiteId,
      date: validEntryDate,
      peopleCount: 8,
      wagePerHead: 1.11,
      workTypeMode: "default_enum",
      workTypeEnum: "Brick work",
    });

    expect(result.success).toBe(true);
  });

  it("rejects zero wagePerHead on create", () => {
    const result = labourEntrySchema.safeParse({
      siteId: validSiteId,
      date: validEntryDate,
      peopleCount: 8,
      wagePerHead: 0,
      workTypeMode: "default_enum",
      workTypeEnum: "Brick work",
    });

    expect(result.success).toBe(false);
  });

  it("rejects wagePerHead with more than 2 decimal places", () => {
    const result = labourEntrySchema.safeParse({
      siteId: validSiteId,
      date: validEntryDate,
      peopleCount: 8,
      wagePerHead: 650.555,
      workTypeMode: "default_enum",
      workTypeEnum: "Brick work",
    });

    expect(result.success).toBe(false);
  });

  it("accepts optional wagePerHead on update", () => {
    const result = updateLabourEntrySchema.safeParse({
      remarks: "Adjusted crew notes",
    });

    expect(result.success).toBe(true);
  });
});

describe("material schemas", () => {
  it("exports the allowed material work stages", () => {
    expect(materialWorkStages).toEqual([
      "Basement Level",
      "Brick Level",
      "Lintel Level",
      "Roof Level",
      "Compound Wall",
      "Other",
    ]);
  });

  it("requires workStage and cost on create", () => {
    const result = materialEntrySchema.safeParse({
      siteId: validSiteId,
      date: validEntryDate,
      quantity: 25,
      materialTypeMode: "default_enum",
      materialTypeEnum: "Cement",
      unitMode: "master",
      unitMasterId: validUnitId,
    });

    expect(result.success).toBe(false);
  });

  it("accepts valid workStage and cost on create", () => {
    const result = materialEntrySchema.safeParse({
      siteId: validSiteId,
      date: validEntryDate,
      quantity: 25,
      cost: 4200.75,
      workStage: "Roof Level",
      materialTypeMode: "custom",
      materialTypeCustomId: validTypeId,
      unitMode: "master",
      unitMasterId: validUnitId,
    });

    expect(result.success).toBe(true);
  });

  it("accepts cost with valid 2 decimal places", () => {
    const result = materialEntrySchema.safeParse({
      siteId: validSiteId,
      date: validEntryDate,
      quantity: 25,
      cost: 0.29,
      workStage: "Roof Level",
      materialTypeMode: "default_enum",
      materialTypeEnum: "Cement",
      unitMode: "master",
      unitMasterId: validUnitId,
    });

    expect(result.success).toBe(true);
  });

  it("accepts an arbitrary non-empty workStage at the schema level (membership is checked at the route via assertInCatalogList)", () => {
    // workStage is now a managed catalog list, not a pg enum: the schema only
    // enforces shape; valid-value membership moved to the route.
    const result = materialEntrySchema.safeParse({
      siteId: validSiteId,
      date: validEntryDate,
      quantity: 25,
      cost: 4200.75,
      workStage: "Ground Floor",
      materialTypeMode: "default_enum",
      materialTypeEnum: "Cement",
      unitMode: "master",
      unitMasterId: validUnitId,
    });

    expect(result.success).toBe(true);
  });

  it("rejects an empty workStage on create", () => {
    const result = materialEntrySchema.safeParse({
      siteId: validSiteId,
      date: validEntryDate,
      quantity: 25,
      cost: 4200.75,
      workStage: "",
      materialTypeMode: "default_enum",
      materialTypeEnum: "Cement",
      unitMode: "master",
      unitMasterId: validUnitId,
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid cost on create", () => {
    const result = materialEntrySchema.safeParse({
      siteId: validSiteId,
      date: validEntryDate,
      quantity: 25,
      cost: 0,
      workStage: "Roof Level",
      materialTypeMode: "default_enum",
      materialTypeEnum: "Cement",
      unitMode: "master",
      unitMasterId: validUnitId,
    });

    expect(result.success).toBe(false);
  });

  it("rejects cost with more than 2 decimal places", () => {
    const result = materialEntrySchema.safeParse({
      siteId: validSiteId,
      date: validEntryDate,
      quantity: 25,
      cost: 4200.999,
      workStage: "Roof Level",
      materialTypeMode: "default_enum",
      materialTypeEnum: "Cement",
      unitMode: "master",
      unitMasterId: validUnitId,
    });

    expect(result.success).toBe(false);
  });

  it("accepts optional omission of workStage and cost on update", () => {
    const result = updateMaterialEntrySchema.safeParse({
      remarks: "Supplier updated",
    });

    expect(result.success).toBe(true);
  });
});

describe("operation consolidation schema additions", () => {
  it("exports the labour work types that use Mason and Helper sections", () => {
    expect(labourSplitWorkTypes).toEqual(["Plastering", "Brick work", "Brickwork"]);
  });

  it("accepts split labour payload for Plastering with Mason and Helper amounts", () => {
    const result = labourEntrySchema.safeParse({
      siteId: validSiteId,
      date: validEntryDate,
      workType: "Plastering",
      masonCount: 2,
      masonSalaryAmount: 2600,
      helperCount: 1,
      helperSalaryAmount: 900,
    });

    expect(result.success).toBe(true);
  });

  it("rejects split labour payload when both Mason and Helper are empty", () => {
    const result = labourEntrySchema.safeParse({
      siteId: validSiteId,
      date: validEntryDate,
      workType: "Brickwork",
      masonCount: 0,
      masonSalaryAmount: 0,
      helperCount: 0,
      helperSalaryAmount: 0,
    });

    expect(result.success).toBe(false);
  });

  it("rejects split labour payload for non-split work types", () => {
    const result = labourEntrySchema.safeParse({
      siteId: validSiteId,
      date: validEntryDate,
      workType: "Plumbing",
      masonCount: 2,
      masonSalaryAmount: 2600,
      helperCount: 1,
      helperSalaryAmount: 900,
    });

    expect(result.success).toBe(false);
  });

  it("requires machinery totalCost on create", () => {
    const result = machineryEntrySchema.safeParse({
      siteId: validSiteId,
      date: validEntryDate,
      equipmentType: "JCB",
      count: 1,
      hoursActive: 4,
    });

    expect(result.success).toBe(false);
  });

  it("accepts valid machinery totalCost on create", () => {
    const result = machineryEntrySchema.safeParse({
      siteId: validSiteId,
      date: validEntryDate,
      equipmentType: "JCB",
      count: 1,
      hoursActive: 4,
      totalCost: 10000,
    });

    expect(result.success).toBe(true);
  });

  it("allows machinery totalCost on update", () => {
    const result = updateMachineryEntrySchema.safeParse({
      totalCost: 12000,
    });

    expect(result.success).toBe(true);
  });

  it("accepts new default material types", () => {
    for (const materialTypeEnum of ["Steel", "Red Brick", "Cement Block 6in", "Cement Block 4in"] as const) {
      const result = materialEntrySchema.safeParse({
        siteId: validSiteId,
        date: validEntryDate,
        quantity: 25,
        cost: 4200,
        workStage: "Roof Level",
        materialTypeMode: "default_enum",
        materialTypeEnum,
        unitMode: "master",
        unitMasterId: validUnitId,
      });

      expect(result.success).toBe(true);
    }
  });
});

describe("entryDateSchema", () => {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  it("accepts today", () => {
    expect(entryDateSchema.safeParse(today).success).toBe(true);
  });
  it("accepts dates far in the past", () => {
    expect(entryDateSchema.safeParse("2020-01-01").success).toBe(true);
  });
  it("rejects future dates", () => {
    expect(entryDateSchema.safeParse(tomorrow).success).toBe(false);
  });
});
