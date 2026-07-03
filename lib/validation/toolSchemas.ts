import { z } from "zod";

// Zod schemas for the Tools Inventory routes (§6, §8). Payload caps bound work
// per request (case 12). qty 0 is allowed in batch-save = "remove assignment".

export const createToolSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    categoryId: z.string().uuid(),
    icon: z.string().trim().min(1).max(50).nullish(),
    openingStock: z.number().int().min(0).max(1_000_000).optional(),
  })
  .strict();
export type CreateToolBody = z.infer<typeof createToolSchema>;

export const patchToolSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    categoryId: z.string().uuid().optional(),
    icon: z.string().trim().min(1).max(50).nullish(),
  })
  .strict();
export type PatchToolBody = z.infer<typeof patchToolSchema>;

const assignmentSchema = z.object({
  siteId: z.string().uuid(),
  qty: z.number().int().min(0).max(1_000_000),
});

export const batchSaveSchema = z
  .object({
    tools: z
      .array(
        z.object({
          toolId: z.string().uuid(),
          version: z.number().int().min(0),
          totalQuantity: z.number().int().min(0).max(1_000_000).optional(),
          assignments: z.array(assignmentSchema).max(100).optional(),
        }),
      )
      .max(200),
  })
  .strict();
export type BatchSaveBody = z.infer<typeof batchSaveSchema>;

export const createCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    codePrefix: z
      .string()
      .trim()
      .min(1)
      .max(8)
      .regex(/^[A-Za-z0-9]+$/, "code prefix must be alphanumeric")
      .transform((s) => s.toUpperCase()),
    sortOrder: z.number().int().min(0).optional(),
  })
  .strict();
export type CreateCategoryBody = z.infer<typeof createCategorySchema>;

export const patchCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    codePrefix: z
      .string()
      .trim()
      .min(1)
      .max(8)
      .regex(/^[A-Za-z0-9]+$/, "code prefix must be alphanumeric")
      .transform((s) => s.toUpperCase())
      .optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .strict();
export type PatchCategoryBody = z.infer<typeof patchCategorySchema>;

// Ledger query params (pagination + filters). All optional.
export const movementsQuerySchema = z.object({
  toolId: z.string().uuid().optional(),
  siteId: z.string().uuid().optional(),
  kind: z.string().max(20).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type MovementsQuery = z.infer<typeof movementsQuerySchema>;
