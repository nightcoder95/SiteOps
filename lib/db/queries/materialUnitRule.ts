import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { categories, materialTypeUnits, subcategories, unitMaster } from "@/lib/db/schema";

import { computeMaterialUnitRule, type MaterialUnitRule } from "./materialUnits";

// Server-only: resolve the allowed/preferred units for a material type from the
// material_type_units mapping, falling back to ALL active units (design §3.3).
export async function materialUnitRuleFor(
  materialType: string | null | undefined,
): Promise<MaterialUnitRule> {
  const name = String(materialType ?? "").trim();

  const activeUnits = await db
    .select({ label: unitMaster.label })
    .from(unitMaster)
    .where(eq(unitMaster.isActive, true))
    .orderBy(unitMaster.sortOrder);
  const activeUnitLabels = activeUnits.map((u) => u.label);

  if (!name) return computeMaterialUnitRule({ mappedUnits: [], activeUnitLabels });

  const subRows = await db
    .select({ subcategoryId: subcategories.subcategoryId })
    .from(subcategories)
    .innerJoin(categories, eq(subcategories.categoryId, categories.categoryId))
    .where(and(eq(categories.name, "Materials"), eq(subcategories.name, name)))
    .limit(1);
  const sub = subRows[0];
  if (!sub) return computeMaterialUnitRule({ mappedUnits: [], activeUnitLabels });

  const mappedUnits = await db
    .select({ label: unitMaster.label, isDefault: materialTypeUnits.isDefault })
    .from(materialTypeUnits)
    .innerJoin(unitMaster, eq(materialTypeUnits.unitId, unitMaster.unitId))
    .where(and(eq(materialTypeUnits.subcategoryId, sub.subcategoryId), eq(unitMaster.isActive, true)));

  return computeMaterialUnitRule({ mappedUnits, activeUnitLabels });
}

export async function allowedMaterialUnitNames(
  materialType: string | null | undefined,
): Promise<string[]> {
  return (await materialUnitRuleFor(materialType)).allowedNames;
}
