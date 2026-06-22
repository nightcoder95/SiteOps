-- Catalog SSOT — Phase 2 schema. Additive + idempotent so it is safe to apply
-- against the push-managed live DB (and to re-run). No data is destroyed.

-- 1. categories: list purpose + editability flags for the admin settings UI.
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS "purpose" varchar(20) NOT NULL DEFAULT 'operation';
--> statement-breakpoint
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS "editable" boolean NOT NULL DEFAULT true;
--> statement-breakpoint

-- 2. subcategories: deactivate-not-delete, ordering, optional remark.
ALTER TABLE public.subcategories
  ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE public.subcategories
  ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE public.subcategories
  ADD COLUMN IF NOT EXISTS "remark" varchar(500);
--> statement-breakpoint

-- 3. unit_master: admin-controlled ordering (is_active already exists).
ALTER TABLE public.unit_master
  ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0;
--> statement-breakpoint

-- 4. material_type_units: admin-managed per-material allowed units.
CREATE TABLE IF NOT EXISTS public.material_type_units (
  "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL PRIMARY KEY,
  "material_type_unit_id" uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE,
  "subcategory_id" uuid NOT NULL,
  "unit_id" uuid NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE public.material_type_units
    ADD CONSTRAINT material_type_units_subcategory_id_fk
    FOREIGN KEY ("subcategory_id") REFERENCES public.subcategories("subcategory_id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE public.material_type_units
    ADD CONSTRAINT material_type_units_unit_id_fk
    FOREIGN KEY ("unit_id") REFERENCES public.unit_master("unit_id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "material_type_units_subcategory_idx"
  ON public.material_type_units ("subcategory_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "material_type_units_sub_unit_uidx"
  ON public.material_type_units ("subcategory_id", "unit_id");
--> statement-breakpoint

-- 5. Seed attribute-list categories (former pg enums become managed lists).
INSERT INTO public.categories (name, purpose, editable) VALUES
  ('Material Work Stage', 'attribute', true),
  ('Expense Category',    'attribute', true),
  ('Incident Type',       'attribute', true),
  ('Incident Severity',   'attribute', true)
ON CONFLICT (name) DO UPDATE SET purpose = 'attribute', editable = true;
--> statement-breakpoint

-- 6. Seed attribute subcategories with their current enum values + ordering.
INSERT INTO public.subcategories (category_id, name, sort_order)
SELECT c.category_id, s.name, s.sort
FROM (VALUES
  ('Material Work Stage','Basement Level',0), ('Material Work Stage','Brick Level',1),
  ('Material Work Stage','Lintel Level',2), ('Material Work Stage','Roof Level',3),
  ('Material Work Stage','Compound Wall',4), ('Material Work Stage','Other',5),
  ('Expense Category','Labour',0), ('Expense Category','Materials',1),
  ('Expense Category','Equipment',2), ('Expense Category','Misc',3),
  ('Incident Type','Safety',0), ('Incident Type','Block',1),
  ('Incident Severity','Low',0), ('Incident Severity','Medium',1),
  ('Incident Severity','High',2), ('Incident Severity','Critical',3)
) AS s(cat, name, sort)
JOIN public.categories c ON c.name = s.cat
WHERE NOT EXISTS (
  SELECT 1 FROM public.subcategories sub
  WHERE sub.category_id = c.category_id AND sub.name = s.name
);
--> statement-breakpoint

-- Keep ordering correct even on re-run / pre-existing rows.
UPDATE public.subcategories sub
SET sort_order = s.sort
FROM (VALUES
  ('Material Work Stage','Basement Level',0), ('Material Work Stage','Brick Level',1),
  ('Material Work Stage','Lintel Level',2), ('Material Work Stage','Roof Level',3),
  ('Material Work Stage','Compound Wall',4), ('Material Work Stage','Other',5),
  ('Expense Category','Labour',0), ('Expense Category','Materials',1),
  ('Expense Category','Equipment',2), ('Expense Category','Misc',3),
  ('Incident Type','Safety',0), ('Incident Type','Block',1),
  ('Incident Severity','Low',0), ('Incident Severity','Medium',1),
  ('Incident Severity','High',2), ('Incident Severity','Critical',3)
) AS s(cat, name, sort)
JOIN public.categories c ON c.name = s.cat
WHERE sub.category_id = c.category_id AND sub.name = s.name AND sub.sort_order <> s.sort;
