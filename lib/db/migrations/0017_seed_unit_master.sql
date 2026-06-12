-- Seed standard construction units into unit_master. Idempotent per-row, so it
-- is safe on fresh and existing databases.
INSERT INTO public.unit_master (code, label, category) VALUES
  ('nos',     'Nos',          'count'),
  ('unit',    'Unit',         'count'),
  ('kg',      'Kilogram',     'weight'),
  ('ton',     'Tonne',        'weight'),
  ('bag',     'Bag',          'weight'),
  ('quintal', 'Quintal',      'weight'),
  ('l',       'Litre',        'volume'),
  ('m3',      'Cubic Metre',  'volume'),
  ('cft',     'Cubic Foot',   'volume'),
  ('brass',   'Brass',        'volume'),
  ('m',       'Metre',        'length'),
  ('ft',      'Foot',         'length'),
  ('mm',      'Millimetre',   'length'),
  ('inch',    'Inch',         'length'),
  ('sqm',     'Square Metre', 'area'),
  ('sqft',    'Square Foot',  'area')
ON CONFLICT (code) DO NOTHING;
