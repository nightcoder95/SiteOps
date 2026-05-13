CREATE INDEX IF NOT EXISTS sites_supervisor_id_idx ON sites (supervisor_id);
CREATE INDEX IF NOT EXISTS sites_archived_at_idx ON sites (archived_at);

CREATE INDEX IF NOT EXISTS labour_entries_site_date_idx ON labour_entries (site_id, date DESC);
CREATE INDEX IF NOT EXISTS labour_entries_created_at_idx ON labour_entries (created_at DESC);
CREATE INDEX IF NOT EXISTS labour_entries_created_by_idx ON labour_entries (created_by);

CREATE INDEX IF NOT EXISTS material_entries_site_date_idx ON material_entries (site_id, date DESC);
CREATE INDEX IF NOT EXISTS material_entries_created_at_idx ON material_entries (created_at DESC);
CREATE INDEX IF NOT EXISTS material_entries_created_by_idx ON material_entries (created_by);

CREATE INDEX IF NOT EXISTS machinery_entries_site_date_idx ON machinery_entries (site_id, date DESC);
CREATE INDEX IF NOT EXISTS machinery_entries_created_at_idx ON machinery_entries (created_at DESC);
CREATE INDEX IF NOT EXISTS machinery_entries_created_by_idx ON machinery_entries (created_by);

CREATE INDEX IF NOT EXISTS expense_entries_site_date_idx ON expense_entries (site_id, date DESC);
CREATE INDEX IF NOT EXISTS expense_entries_created_at_idx ON expense_entries (created_at DESC);
CREATE INDEX IF NOT EXISTS expense_entries_created_by_idx ON expense_entries (created_by);

CREATE INDEX IF NOT EXISTS incident_reports_site_created_at_idx ON incident_reports (site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS incident_reports_reported_by_idx ON incident_reports (reported_by);

CREATE INDEX IF NOT EXISTS resource_requests_site_status_created_idx ON resource_requests (site_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS resource_requests_requested_by_status_created_idx ON resource_requests (requested_by, status, created_at DESC);
CREATE INDEX IF NOT EXISTS resource_requests_status_updated_at_idx ON resource_requests (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS field_requests_site_status_created_idx ON field_requests (site_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS field_requests_requested_by_status_created_idx ON field_requests (requested_by, status, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_read_idx ON notifications (user_id, read_at);

CREATE INDEX IF NOT EXISTS generic_entries_site_date_idx ON generic_entries (site_id, date DESC);
CREATE INDEX IF NOT EXISTS generic_entries_field_definition_idx ON generic_entries (field_definition_id);

CREATE UNIQUE INDEX IF NOT EXISTS field_definitions_subcategory_label_uidx
  ON field_definitions (subcategory_id, label);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sites_supervisor_id_fk') THEN
    ALTER TABLE sites
      ADD CONSTRAINT sites_supervisor_id_fk
      FOREIGN KEY (supervisor_id) REFERENCES users(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_user_id_fk') THEN
    ALTER TABLE user_profiles
      ADD CONSTRAINT user_profiles_user_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id)
      ON UPDATE CASCADE ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'labour_entries_site_id_fk') THEN
    ALTER TABLE labour_entries
      ADD CONSTRAINT labour_entries_site_id_fk
      FOREIGN KEY (site_id) REFERENCES sites(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'labour_entries_created_by_fk') THEN
    ALTER TABLE labour_entries
      ADD CONSTRAINT labour_entries_created_by_fk
      FOREIGN KEY (created_by) REFERENCES users(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'material_entries_site_id_fk') THEN
    ALTER TABLE material_entries
      ADD CONSTRAINT material_entries_site_id_fk
      FOREIGN KEY (site_id) REFERENCES sites(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'material_entries_created_by_fk') THEN
    ALTER TABLE material_entries
      ADD CONSTRAINT material_entries_created_by_fk
      FOREIGN KEY (created_by) REFERENCES users(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'machinery_entries_site_id_fk') THEN
    ALTER TABLE machinery_entries
      ADD CONSTRAINT machinery_entries_site_id_fk
      FOREIGN KEY (site_id) REFERENCES sites(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'machinery_entries_created_by_fk') THEN
    ALTER TABLE machinery_entries
      ADD CONSTRAINT machinery_entries_created_by_fk
      FOREIGN KEY (created_by) REFERENCES users(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_entries_site_id_fk') THEN
    ALTER TABLE expense_entries
      ADD CONSTRAINT expense_entries_site_id_fk
      FOREIGN KEY (site_id) REFERENCES sites(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_entries_created_by_fk') THEN
    ALTER TABLE expense_entries
      ADD CONSTRAINT expense_entries_created_by_fk
      FOREIGN KEY (created_by) REFERENCES users(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resource_requests_site_id_fk') THEN
    ALTER TABLE resource_requests
      ADD CONSTRAINT resource_requests_site_id_fk
      FOREIGN KEY (site_id) REFERENCES sites(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resource_requests_requested_by_fk') THEN
    ALTER TABLE resource_requests
      ADD CONSTRAINT resource_requests_requested_by_fk
      FOREIGN KEY (requested_by) REFERENCES users(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resource_requests_approved_by_fk') THEN
    ALTER TABLE resource_requests
      ADD CONSTRAINT resource_requests_approved_by_fk
      FOREIGN KEY (approved_by) REFERENCES users(id)
      ON UPDATE CASCADE ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'field_requests_site_id_fk') THEN
    ALTER TABLE field_requests
      ADD CONSTRAINT field_requests_site_id_fk
      FOREIGN KEY (site_id) REFERENCES sites(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'field_requests_category_id_fk') THEN
    ALTER TABLE field_requests
      ADD CONSTRAINT field_requests_category_id_fk
      FOREIGN KEY (category_id) REFERENCES categories(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'field_requests_subcategory_id_fk') THEN
    ALTER TABLE field_requests
      ADD CONSTRAINT field_requests_subcategory_id_fk
      FOREIGN KEY (subcategory_id) REFERENCES subcategories(id)
      ON UPDATE CASCADE ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'field_requests_requested_by_fk') THEN
    ALTER TABLE field_requests
      ADD CONSTRAINT field_requests_requested_by_fk
      FOREIGN KEY (requested_by) REFERENCES users(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'incident_reports_site_id_fk') THEN
    ALTER TABLE incident_reports
      ADD CONSTRAINT incident_reports_site_id_fk
      FOREIGN KEY (site_id) REFERENCES sites(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'incident_reports_reported_by_fk') THEN
    ALTER TABLE incident_reports
      ADD CONSTRAINT incident_reports_reported_by_fk
      FOREIGN KEY (reported_by) REFERENCES users(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_user_id_fk') THEN
    ALTER TABLE notifications
      ADD CONSTRAINT notifications_user_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id)
      ON UPDATE CASCADE ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subcategories_category_id_fk') THEN
    ALTER TABLE subcategories
      ADD CONSTRAINT subcategories_category_id_fk
      FOREIGN KEY (category_id) REFERENCES categories(id)
      ON UPDATE CASCADE ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'field_definitions_subcategory_id_fk') THEN
    ALTER TABLE field_definitions
      ADD CONSTRAINT field_definitions_subcategory_id_fk
      FOREIGN KEY (subcategory_id) REFERENCES subcategories(id)
      ON UPDATE CASCADE ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'generic_entries_site_id_fk') THEN
    ALTER TABLE generic_entries
      ADD CONSTRAINT generic_entries_site_id_fk
      FOREIGN KEY (site_id) REFERENCES sites(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'generic_entries_field_definition_id_fk') THEN
    ALTER TABLE generic_entries
      ADD CONSTRAINT generic_entries_field_definition_id_fk
      FOREIGN KEY (field_definition_id) REFERENCES field_definitions(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'generic_entries_created_by_fk') THEN
    ALTER TABLE generic_entries
      ADD CONSTRAINT generic_entries_created_by_fk
      FOREIGN KEY (created_by) REFERENCES users(id)
      ON UPDATE CASCADE ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_user_id_fk') THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_user_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id)
      ON UPDATE CASCADE ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_user_id_fk') THEN
    ALTER TABLE accounts
      ADD CONSTRAINT accounts_user_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id)
      ON UPDATE CASCADE ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;
