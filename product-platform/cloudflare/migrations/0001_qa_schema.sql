PRAGMA foreign_keys = ON;

CREATE TABLE catalog_categories (
  id TEXT PRIMARY KEY, parent_id TEXT REFERENCES catalog_categories(id),
  level TEXT NOT NULL CHECK (level IN ('environment','subcategory','product_category')),
  environment TEXT NOT NULL CHECK (environment IN ('indoor','outdoor')),
  name TEXT NOT NULL, slug TEXT NOT NULL, full_slug TEXT NOT NULL UNIQUE,
  route_path TEXT NOT NULL UNIQUE, sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (parent_id, slug)
);

CREATE TABLE product_families (
  id TEXT PRIMARY KEY, category_id TEXT NOT NULL REFERENCES catalog_categories(id),
  environment TEXT NOT NULL CHECK (environment IN ('indoor','outdoor')),
  family_code TEXT, family_code_normalized TEXT, slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL, series_label TEXT, short_description TEXT, description TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft','published','archived','discontinued')),
  sort_order INTEGER NOT NULL DEFAULT 0, is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0,1)),
  source_file TEXT, source_sheet TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);

CREATE TABLE products (
  id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES product_families(id),
  model_no TEXT NOT NULL, model_no_normalized TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL, variant_label TEXT, power_text TEXT, power_watts REAL,
  status TEXT NOT NULL CHECK (status IN ('draft','published','archived','discontinued')),
  is_primary_variant INTEGER NOT NULL DEFAULT 0 CHECK (is_primary_variant IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0, mrp_inr INTEGER, raw_excel_values TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);

CREATE TABLE indoor_product_details (
  product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  size_text TEXT, cutout_text TEXT, finish_text TEXT, cct_text TEXT, beam_angle_text TEXT,
  light_source TEXT, ip_rating TEXT, cri INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE outdoor_product_details (
  product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  size_text TEXT, finish_text TEXT, cct_text TEXT, light_source TEXT, ip_rating TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE product_spec_values (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  spec_key TEXT NOT NULL, spec_label TEXT NOT NULL, value_text TEXT NOT NULL, value_normalized TEXT NOT NULL,
  value_number REAL, unit TEXT, source_text TEXT, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
  UNIQUE (product_id, spec_key, value_normalized)
);

CREATE TABLE product_extra_fields (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  field_group TEXT NOT NULL DEFAULT 'general', field_key TEXT NOT NULL, field_label TEXT NOT NULL,
  value_text TEXT NOT NULL, value_number REAL, unit TEXT,
  is_public INTEGER NOT NULL DEFAULT 1 CHECK (is_public IN (0,1)), sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, UNIQUE (product_id, field_key)
);

CREATE TABLE import_source_rows (
  id TEXT PRIMARY KEY, import_batch_id TEXT NOT NULL, source_file TEXT NOT NULL, source_sheet TEXT NOT NULL,
  source_row_number INTEGER NOT NULL, pdf_page INTEGER, source_reference TEXT, category_id TEXT, family_id TEXT,
  product_id TEXT REFERENCES products(id), model_no TEXT, raw_values TEXT NOT NULL,
  normalized_values TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL, warnings TEXT NOT NULL DEFAULT '[]',
  errors TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL,
  UNIQUE (import_batch_id, source_sheet, source_row_number)
);

CREATE TABLE asset_files (
  id TEXT PRIMARY KEY, bucket TEXT NOT NULL, storage_key TEXT NOT NULL, original_filename TEXT,
  mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, checksum_sha256 TEXT NOT NULL,
  width INTEGER NOT NULL, height INTEGER NOT NULL, source_width INTEGER, source_height INTEGER, source_path TEXT,
  source_was_low_resolution INTEGER NOT NULL DEFAULT 0 CHECK (source_was_low_resolution IN (0,1)),
  was_upscaled INTEGER NOT NULL DEFAULT 0 CHECK (was_upscaled IN (0,1)),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived','quarantined')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, UNIQUE (bucket, storage_key)
);

CREATE TABLE product_assets (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES asset_files(id) ON DELETE CASCADE, asset_role TEXT NOT NULL DEFAULT 'product',
  variant TEXT, alt_text TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  is_public INTEGER NOT NULL DEFAULT 1 CHECK (is_public IN (0,1)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (product_id, asset_role, sort_order)
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY, actor_email TEXT, action TEXT NOT NULL, entity_type TEXT NOT NULL,
  entity_id TEXT, metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);

CREATE INDEX catalog_categories_parent_sort_idx ON catalog_categories(parent_id,sort_order);
CREATE INDEX product_families_category_status_idx ON product_families(category_id,status,sort_order);
CREATE INDEX products_family_status_idx ON products(family_id,status,sort_order);
CREATE INDEX products_model_no_idx ON products(model_no_normalized);
CREATE UNIQUE INDEX products_family_model_unique_idx ON products(family_id,model_no_normalized) WHERE deleted_at IS NULL;
CREATE INDEX product_spec_values_product_idx ON product_spec_values(product_id,spec_key,sort_order);
CREATE INDEX product_spec_values_lookup_idx ON product_spec_values(spec_key,value_normalized,product_id);
CREATE INDEX product_extra_fields_product_idx ON product_extra_fields(product_id,sort_order);
CREATE INDEX import_source_rows_product_idx ON import_source_rows(product_id);
CREATE INDEX product_assets_product_idx ON product_assets(product_id,asset_role,sort_order);
CREATE UNIQUE INDEX product_assets_one_primary_idx ON product_assets(product_id) WHERE is_primary=1 AND is_public=1;
