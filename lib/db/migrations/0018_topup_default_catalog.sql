-- Per-row top-up of default categories/subcategories. Idempotent and safe on
-- already-seeded DBs (unlike the all-or-nothing guard in 0009), so databases
-- seeded before catalog changes converge to the full default set.

INSERT INTO public.categories (name) VALUES
  ('Labour'), ('Materials'), ('Machinery/Equipment'), ('Expenses')
ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
INSERT INTO public.subcategories (category_id, name)
SELECT c.category_id, s.name
FROM (VALUES
  ('Labour','Steel work'), ('Labour','Shuttering'), ('Labour','Brick work'),
  ('Labour','Concrete work'), ('Labour','Plastering'), ('Labour','Electric work'),
  ('Labour','Plumbing'), ('Labour','Tile work'), ('Labour','Wood work'), ('Labour','Paint work'),
  ('Materials','Cement'), ('Materials','M sand'), ('Materials','P sand'), ('Materials','Metal'),
  ('Materials','Steel'), ('Materials','Red Brick'), ('Materials','Cement Block 6in'), ('Materials','Cement Block 4in'),
  ('Machinery/Equipment','Excavator'), ('Machinery/Equipment','Concrete Mixer'),
  ('Machinery/Equipment','Crane'), ('Machinery/Equipment','Vibrator'), ('Machinery/Equipment','Generator'),
  ('Expenses','Transport'), ('Expenses','Food'), ('Expenses','Misc')
) AS s(cat, name)
JOIN public.categories c ON c.name = s.cat
WHERE NOT EXISTS (
  SELECT 1 FROM public.subcategories sub
  WHERE sub.category_id = c.category_id AND sub.name = s.name
);
