ALTER TYPE "public"."material_default_type" ADD VALUE IF NOT EXISTS 'Steel';
ALTER TYPE "public"."material_default_type" ADD VALUE IF NOT EXISTS 'Red Brick';
ALTER TYPE "public"."material_default_type" ADD VALUE IF NOT EXISTS 'Cement Block 6in';
ALTER TYPE "public"."material_default_type" ADD VALUE IF NOT EXISTS 'Cement Block 4in';
--> statement-breakpoint

ALTER TABLE "labour_entries"
ADD COLUMN IF NOT EXISTS "salary_amount" numeric(12, 2),
ADD COLUMN IF NOT EXISTS "mason_count" integer,
ADD COLUMN IF NOT EXISTS "mason_salary_amount" numeric(12, 2),
ADD COLUMN IF NOT EXISTS "helper_count" integer,
ADD COLUMN IF NOT EXISTS "helper_salary_amount" numeric(12, 2);
--> statement-breakpoint

ALTER TABLE "machinery_entries"
ADD COLUMN IF NOT EXISTS "total_cost" numeric(12, 2);
--> statement-breakpoint

INSERT INTO "unit_master" ("code", "label", "category")
VALUES ('cft', 'CFT', 'volume')
ON CONFLICT ("code") DO UPDATE
SET "label" = EXCLUDED."label",
    "category" = EXCLUDED."category",
    "is_active" = true,
    "updated_at" = now();
--> statement-breakpoint

DO $$
DECLARE
  materials_id uuid;
BEGIN
  SELECT category_id INTO materials_id
  FROM public.categories
  WHERE name = 'Materials'
  LIMIT 1;

  IF materials_id IS NOT NULL THEN
    INSERT INTO public.subcategories (category_id, name)
    SELECT materials_id, v.name
    FROM (VALUES
      ('Steel'),
      ('Red Brick'),
      ('Cement Block 6in'),
      ('Cement Block 4in')
    ) AS v(name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.subcategories s
      WHERE s.category_id = materials_id
        AND lower(s.name) = lower(v.name)
    );
  END IF;
END $$;
