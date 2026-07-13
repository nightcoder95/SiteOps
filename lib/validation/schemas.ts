import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const emailSchema = z.string().email().max(255);

function positiveDecimalSchema(max: number) {
  return z
    .number()
    .positive()
    .max(max)
    .refine((value) => Number(value.toFixed(2)) === value, {
      message: "Value must have at most 2 decimal places",
    });
}

const nonNegativeMoneySchema = z
  .number()
  .min(0)
  .max(100000000)
  .refine((value) => Number(value.toFixed(2)) === value, {
    message: "Value must have at most 2 decimal places",
  });

export const labourDefaultTypes = [
  "Steel work",
  "Shuttering",
  "Brick work",
  "Concrete work",
  "Plastering",
  "Electric work",
  "Plumbing",
  "Tile work",
  "Wood work",
  "Paint work",
] as const;

export const labourSplitWorkTypes = ["Plastering", "Brick work", "Brickwork"] as const;

export function isSplitLabourWorkType(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return normalized === "plastering" || normalized === "brick work" || normalized === "brickwork";
}

function labourWorkTypeFromPayload(value: Record<string, unknown>) {
  if (typeof value.workType === "string" && value.workType.trim()) return value.workType;
  if (typeof value.workTypeEnum === "string" && value.workTypeEnum.trim()) return value.workTypeEnum;
  return null;
}

export const materialDefaultTypes = [
  "Cement",
  "M sand",
  "P sand",
  "Metal",
  "Steel",
  "Red Brick",
  "Cement Block 6in",
  "Cement Block 4in",
] as const;
export const materialWorkStages = [
  "Basement Level",
  "Brick Level",
  "Lintel Level",
  "Roof Level",
  "Compound Wall",
  "Other",
] as const;

export const entryDateSchema = z.string().date().refine(
  (d) => {
    // No-future guard only; backdating is unlimited. Compare date strings in UTC
    // to avoid timezone-offset issues (new Date("2026-05-13") is UTC midnight).
    const todayUtc = new Date().toISOString().slice(0, 10);
    return d <= todayUtc;
  },
  { message: "Entry date cannot be in the future" }
);

const labourLegacyShape = z.object({
  workType: z.string().min(1).max(50),
});

const labourDefaultMode = z.object({
  workTypeMode: z.literal("default_enum"),
  workTypeEnum: z.enum(labourDefaultTypes),
  workTypeCustomId: z.never().optional(),
  workType: z.string().optional(),
});

const labourCustomMode = z.object({
  workTypeMode: z.literal("custom"),
  workTypeEnum: z.never().optional(),
  workTypeCustomId: uuidSchema,
  workType: z.string().optional(),
});

const labourCommonCreateShape = z.object({
  siteId: uuidSchema,
  date: entryDateSchema,
  remarks: z.string().max(500).optional(),
});

const labourOrdinaryCostShape = z.object({
  peopleCount: z.number().int().positive().max(10000),
  wagePerHead: positiveDecimalSchema(1000000),
  salaryAmount: positiveDecimalSchema(100000000).optional(),
});

const labourSplitCostShape = z.object({
  masonCount: z.number().int().min(0).max(10000).default(0),
  masonSalaryAmount: nonNegativeMoneySchema.default(0),
  helperCount: z.number().int().min(0).max(10000).default(0),
  helperSalaryAmount: nonNegativeMoneySchema.default(0),
}).refine(
  (value) =>
    value.masonCount > 0 ||
    value.helperCount > 0 ||
    value.masonSalaryAmount > 0 ||
    value.helperSalaryAmount > 0,
  { message: "Mason or Helper values are required" },
);

export const labourEntrySchema = labourCommonCreateShape
  .and(z.union([labourLegacyShape, labourDefaultMode, labourCustomMode]))
  .and(z.union([labourOrdinaryCostShape, labourSplitCostShape]))
  .superRefine((value, ctx) => {
    const workType = labourWorkTypeFromPayload(value);
    const hasSplitFields =
      "masonCount" in value ||
      "masonSalaryAmount" in value ||
      "helperCount" in value ||
      "helperSalaryAmount" in value;

    if (hasSplitFields && !isSplitLabourWorkType(workType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Mason and Helper values are only supported for Plastering and Brickwork",
        path: ["workType"],
      });
    }
  });

export const updateLabourEntrySchema = z.object({
  date: entryDateSchema.optional(),
  peopleCount: z.number().int().positive().max(10000).optional(),
  wagePerHead: positiveDecimalSchema(1000000).optional(),
  salaryAmount: positiveDecimalSchema(100000000).optional(),
  masonCount: z.number().int().min(0).max(10000).optional(),
  masonSalaryAmount: nonNegativeMoneySchema.optional(),
  helperCount: z.number().int().min(0).max(10000).optional(),
  helperSalaryAmount: nonNegativeMoneySchema.optional(),
  remarks: z.string().max(500).optional(),
  workType: z.string().min(1).max(50).optional(),
  workTypeMode: z.enum(["default_enum", "custom"]).optional(),
  workTypeEnum: z.enum(labourDefaultTypes).optional(),
  workTypeCustomId: uuidSchema.optional(),
});

const materialLegacyShape = z.object({
  materialType: z.string().min(1).max(100),
  unit: z.string().min(1).max(50),
});

const materialDefaultMode = z.object({
  materialTypeMode: z.literal("default_enum"),
  materialTypeEnum: z.enum(materialDefaultTypes),
  materialTypeCustomId: z.never().optional(),
  materialType: z.string().optional(),
});

const materialCustomMode = z.object({
  materialTypeMode: z.literal("custom"),
  materialTypeEnum: z.never().optional(),
  materialTypeCustomId: uuidSchema,
  materialType: z.string().optional(),
});

const materialMasterUnit = z.object({
  unitMode: z.literal("master"),
  unitMasterId: uuidSchema,
  unitCustomId: z.never().optional(),
  unit: z.string().optional(),
});

const materialCustomUnit = z.object({
  unitMode: z.literal("custom"),
  unitMasterId: z.never().optional(),
  unitCustomId: uuidSchema,
  unit: z.string().optional(),
});

export const materialEntrySchema = z
  .object({
    siteId: uuidSchema,
    date: entryDateSchema,
    quantity: z.number().positive().max(1000000),
    // Shape only; membership checked at the route via assertInCatalogList
    // ("Material Work Stage") against the active managed list.
    workStage: z.string().min(1).max(100),
    cost: positiveDecimalSchema(100000000).optional(),
    remarks: z.string().max(500).optional(),
  })
  .and(z.union([materialLegacyShape, z.intersection(z.union([materialDefaultMode, materialCustomMode]), z.union([materialMasterUnit, materialCustomUnit]))]));

export const updateMaterialEntrySchema = z.object({
  date: entryDateSchema.optional(),
  quantity: z.number().positive().max(1000000).optional(),
  workStage: z.string().min(1).max(100).optional(),
  cost: positiveDecimalSchema(100000000).optional(),
  remarks: z.string().max(500).optional(),
  materialType: z.string().min(1).max(100).optional(),
  materialTypeMode: z.enum(["default_enum", "custom"]).optional(),
  materialTypeEnum: z.enum(materialDefaultTypes).optional(),
  materialTypeCustomId: uuidSchema.optional(),
  unit: z.string().min(1).max(50).optional(),
  unitMode: z.enum(["master", "custom"]).optional(),
  unitMasterId: uuidSchema.optional(),
  unitCustomId: uuidSchema.optional(),
});

const machineryLegacyShape = z.object({
  equipmentType: z.string().min(1).max(100),
  hoursActive: z.number().positive().max(24),
});

const machineryDefaultMode = z.object({
  equipmentTypeMode: z.literal("default_enum"),
  equipmentTypeCustomId: z.never().optional(),
  equipmentType: z.string().optional(),
  hoursActive: z.number().positive().max(24).optional(),
});

const machineryCustomMode = z.object({
  equipmentTypeMode: z.literal("custom"),
  equipmentTypeCustomId: uuidSchema,
  equipmentType: z.string().optional(),
  hoursActive: z.number().positive().max(24).optional(),
});

export const machineryEntrySchema = z
  .object({
    siteId: uuidSchema,
    date: entryDateSchema,
    count: z.number().int().positive().max(10000),
    totalCost: positiveDecimalSchema(100000000),
    remarks: z.string().max(500).optional(),
  })
  .and(z.union([machineryLegacyShape, machineryDefaultMode, machineryCustomMode]));

export const updateMachineryEntrySchema = z.object({
  date: entryDateSchema.optional(),
  count: z.number().int().positive().max(10000).optional(),
  totalCost: positiveDecimalSchema(100000000).optional(),
  remarks: z.string().max(500).optional(),
  equipmentType: z.string().min(1).max(100).optional(),
  equipmentTypeMode: z.enum(["default_enum", "custom"]).optional(),
  equipmentTypeCustomId: uuidSchema.optional(),
  hoursActive: z.number().positive().max(24).optional(),
});

export const expenseEntrySchema = z.object({
  siteId: uuidSchema,
  date: entryDateSchema,
  description: z.string().min(1).max(500),
  amount: z.number().positive().max(1000000),
  // Shape only; membership checked at the route ("Expense Category").
  category: z.string().min(1).max(100),
});

export const updateExpenseEntrySchema = expenseEntrySchema.partial().omit({ siteId: true });

export const incidentEntrySchema = z.object({
  siteId: uuidSchema,
  // Shape only; membership checked at the route ("Incident Type"/"Incident Severity").
  incidentType: z.string().min(1).max(100),
  severity: z.string().min(1).max(50).optional(),
  description: z.string().min(1).max(2000),
  durationEstimate: z.number().int().positive().max(10080).optional(),
});

export const updateIncidentEntrySchema = incidentEntrySchema.partial().omit({ siteId: true });

export const resourceRequestSchema = z.object({
  siteId: uuidSchema,
  type: z.enum(["Labour", "Materials", "Money", "Machinery"]),
  details: z.string().min(10).max(1000),
  reason: z.string().min(10).max(500),
});

export const updateResourceRequestSchema = z.object({
  status: z.enum(["Approved", "Declined"]),
});

export const dynamicEntrySchema = z.object({
  siteId: uuidSchema,
  date: entryDateSchema,
  fieldDefinitionId: uuidSchema,
  value: z.union([z.string(), z.number(), z.boolean()]),
});
