-- Catalog SSOT — Phase 4. One-time, reviewed data cleanup (design §6, handoff §3).
-- Fixes drift in the live catalog and seeds material_type_units from the former
-- hardcoded KNOWN_RULES. Idempotent where practical so re-running is safe.
--
-- Entries store option values as FREE TEXT (not FKs): renaming/deleting a
-- catalog item does NOT cascade to entries. The only entry rewrite here is the
-- explicit painting -> Paint work merge.

-- ============================================================================
-- 1. LABOUR cleanup (category "Labour")
-- ============================================================================

-- 1a. Merge `painting` (3 entries) into `Paint work`, then drop the subcategory.
UPDATE public.labour_entries
  SET work_type = 'Paint work'
  WHERE work_type = 'painting';
--> statement-breakpoint
DELETE FROM public.subcategories s
  USING public.categories c
  WHERE s.category_id = c.category_id
    AND c.name = 'Labour'
    AND s.name = 'painting';
--> statement-breakpoint

-- 1b. `Basement` (0 entries) -> delete.
DELETE FROM public.subcategories s
  USING public.categories c
  WHERE s.category_id = c.category_id
    AND c.name = 'Labour'
    AND s.name = 'Basement';
--> statement-breakpoint

-- 1c. Valuation / Mason / Helper / Fee / Other -> deactivate (entries keep string).
UPDATE public.subcategories s
  SET is_active = false
  FROM public.categories c
  WHERE s.category_id = c.category_id
    AND c.name = 'Labour'
    AND s.name IN ('Valuation', 'Mason', 'Helper', 'Fee', 'Other');
--> statement-breakpoint

-- ============================================================================
-- 2. MATERIAL / EQUIPMENT cleanup
-- ============================================================================

-- 2a. Add `Hitachi` to Machinery/Equipment (active). Guarded against re-run.
INSERT INTO public.subcategories (category_id, name, is_active, sort_order)
SELECT c.category_id, 'Hitachi', true, 0
FROM public.categories c
WHERE c.name = 'Machinery/Equipment'
  AND NOT EXISTS (
    SELECT 1 FROM public.subcategories s
    WHERE s.category_id = c.category_id AND s.name = 'Hitachi'
  );
--> statement-breakpoint

-- 2b. `Hittachi` (misspelled, in Materials) -> deactivate. The 1 stray material
--     entry keeps material_type='Hittachi' as history (not re-pointed).
UPDATE public.subcategories s
  SET is_active = false
  FROM public.categories c
  WHERE s.category_id = c.category_id
    AND c.name = 'Materials'
    AND s.name = 'Hittachi';
--> statement-breakpoint

-- 2c. `Other` (in Materials) -> deactivate.
UPDATE public.subcategories s
  SET is_active = false
  FROM public.categories c
  WHERE s.category_id = c.category_id
    AND c.name = 'Materials'
    AND s.name = 'Other';
--> statement-breakpoint

-- ============================================================================
-- 3. UNIT dedup (unit_master) — retire true duplicates by display label.
--    Retire = is_active=false; FK-referenced rows stay intact.
--    (`bag_50kg` already labelled "Bag (50 kg)"; the colliding DISPLAY_OVERRIDES
--     line was removed in code in phase 1, so no relabel needed here.)
-- ============================================================================
UPDATE public.unit_master SET is_active = false WHERE code = 'ton';   -- keep `tonne` -> "Tonne"
--> statement-breakpoint
UPDATE public.unit_master SET is_active = false WHERE code = 'l';      -- keep `litre` -> "Litre"
--> statement-breakpoint

-- ============================================================================
-- 4. Seed material_type_units from the former hardcoded KNOWN_RULES so the
--    table reproduces today's per-material allowed/preferred unit behaviour.
--    Each material maps to one preferred unit (is_default=true).
-- ============================================================================
INSERT INTO public.material_type_units (subcategory_id, unit_id, is_default)
SELECT s.subcategory_id, u.unit_id, true
FROM (VALUES
  ('Cement',           'bag'),
  ('M sand',           'cft'),
  ('P sand',           'cft'),
  ('Metal',            'cft'),
  ('Steel',            'kg'),
  ('Red Brick',        'nos'),
  ('Cement Block 6in', 'nos'),
  ('Cement Block 4in', 'nos')
) AS r(material, unit_code)
JOIN public.categories c ON c.name = 'Materials'
JOIN public.subcategories s ON s.category_id = c.category_id AND s.name = r.material
JOIN public.unit_master u ON u.code = r.unit_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.material_type_units m
  WHERE m.subcategory_id = s.subcategory_id AND m.unit_id = u.unit_id
);
