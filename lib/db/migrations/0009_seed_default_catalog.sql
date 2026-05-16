-- Seed default categories + subcategories at migration time so the API route
-- does not have to check + seed on every GET.
-- Idempotent: skipped entirely if the categories table already has any rows.

DO $$
DECLARE
  has_rows boolean;
  labour_id uuid;
  materials_id uuid;
  machinery_id uuid;
  expenses_id uuid;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.categories) INTO has_rows;
  IF has_rows THEN
    RETURN;
  END IF;

  INSERT INTO public.categories (name, icon) VALUES ('Labour', NULL) RETURNING category_id INTO labour_id;
  INSERT INTO public.categories (name, icon) VALUES ('Materials', NULL) RETURNING category_id INTO materials_id;
  INSERT INTO public.categories (name, icon) VALUES ('Machinery/Equipment', NULL) RETURNING category_id INTO machinery_id;
  INSERT INTO public.categories (name, icon) VALUES ('Expenses', NULL) RETURNING category_id INTO expenses_id;

  INSERT INTO public.subcategories (category_id, name) VALUES
    (labour_id, 'Steel work'),
    (labour_id, 'Shuttering'),
    (labour_id, 'Brick work'),
    (labour_id, 'Concrete work'),
    (labour_id, 'Plastering'),
    (labour_id, 'Electric work'),
    (labour_id, 'Plumbing'),
    (labour_id, 'Tile work'),
    (labour_id, 'Wood work'),
    (labour_id, 'Paint work');

  INSERT INTO public.subcategories (category_id, name) VALUES
    (materials_id, 'Cement'),
    (materials_id, 'M sand'),
    (materials_id, 'P sand'),
    (materials_id, 'Metal');

  INSERT INTO public.subcategories (category_id, name) VALUES
    (machinery_id, 'Excavator'),
    (machinery_id, 'Concrete Mixer'),
    (machinery_id, 'Crane'),
    (machinery_id, 'Vibrator'),
    (machinery_id, 'Generator');

  INSERT INTO public.subcategories (category_id, name) VALUES
    (expenses_id, 'Transport'),
    (expenses_id, 'Food'),
    (expenses_id, 'Misc');
END $$;
