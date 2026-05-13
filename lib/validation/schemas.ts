import { z } from "zod";

import { MAX_BACKDATE_DAYS } from "@/lib/validation/constants";

export const uuidSchema = z.string().uuid();
export const emailSchema = z.string().email().max(255);

const labourDefaultTypes = [
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

const materialDefaultTypes = ["Cement", "M sand", "P sand", "Metal"] as const;

export const entryDateSchema = z.string().date().refine(
  (d) => {
    // Compare date strings directly in UTC to avoid timezone-offset issues.
    // new Date("2026-05-13") produces UTC midnight, but new Date() is local time,
    // which could accept future dates or reject same-day entries depending on timezone.
    const todayUtc = new Date().toISOString().slice(0, 10);
    const floorUtc = new Date(Date.now() - MAX_BACKDATE_DAYS * 86400000).toISOString().slice(0, 10);
    return d >= floorUtc && d <= todayUtc;
  },
  { message: `Entry date must be within the last ${MAX_BACKDATE_DAYS} days` }
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

export const labourEntrySchema = z
  .object({
    siteId: uuidSchema,
    date: entryDateSchema,
    peopleCount: z.number().int().positive().max(10000),
    remarks: z.string().max(500).optional(),
  })
  .and(z.union([labourLegacyShape, labourDefaultMode, labourCustomMode]));

export const updateLabourEntrySchema = z.object({
  date: entryDateSchema.optional(),
  peopleCount: z.number().int().positive().max(10000).optional(),
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
    remarks: z.string().max(500).optional(),
  })
  .and(z.union([materialLegacyShape, z.intersection(z.union([materialDefaultMode, materialCustomMode]), z.union([materialMasterUnit, materialCustomUnit]))]));

export const updateMaterialEntrySchema = z.object({
  date: entryDateSchema.optional(),
  quantity: z.number().positive().max(1000000).optional(),
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
    remarks: z.string().max(500).optional(),
  })
  .and(z.union([machineryLegacyShape, machineryDefaultMode, machineryCustomMode]));

export const updateMachineryEntrySchema = z.object({
  date: entryDateSchema.optional(),
  count: z.number().int().positive().max(10000).optional(),
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
  category: z.enum(["Labour", "Materials", "Equipment", "Misc"]),
});

export const updateExpenseEntrySchema = expenseEntrySchema.partial().omit({ siteId: true });

export const incidentEntrySchema = z.object({
  siteId: uuidSchema,
  incidentType: z.enum(["Safety", "Block"]),
  severity: z.enum(["Low", "Medium", "High", "Critical"]).optional(),
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
