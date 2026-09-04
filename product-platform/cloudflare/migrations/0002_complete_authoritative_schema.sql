-- Complete the authoritative D1 schema so every Supabase public table and
-- migration-relevant column has a D1 representation. The extra QA image
-- provenance columns introduced in 0001 are intentionally retained.

PRAGMA foreign_keys = ON;

ALTER TABLE products ADD COLUMN search_text TEXT;
ALTER TABLE asset_files ADD COLUMN public_url TEXT;
ALTER TABLE product_assets ADD COLUMN title TEXT;
ALTER TABLE product_assets ADD COLUMN caption TEXT;
ALTER TABLE audit_logs ADD COLUMN actor_user_id TEXT;

CREATE TABLE import_batches (
  id TEXT PRIMARY KEY,
  source_file TEXT NOT NULL,
  source_url TEXT,
  source_file_checksum TEXT,
  source_kind TEXT NOT NULL DEFAULT 'xlsx',
  status TEXT NOT NULL CHECK (status IN ('dry_run','applied','failed','rolled_back')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  total_rows INTEGER NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  valid_rows INTEGER NOT NULL DEFAULT 0 CHECK (valid_rows >= 0),
  invalid_rows INTEGER NOT NULL DEFAULT 0 CHECK (invalid_rows >= 0),
  families_created INTEGER NOT NULL DEFAULT 0 CHECK (families_created >= 0),
  products_created INTEGER NOT NULL DEFAULT 0 CHECK (products_created >= 0),
  products_updated INTEGER NOT NULL DEFAULT 0 CHECK (products_updated >= 0),
  assets_linked INTEGER NOT NULL DEFAULT 0 CHECK (assets_linked >= 0),
  warnings TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(warnings)),
  errors TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(errors))
);

CREATE TABLE product_family_assets (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES product_families(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES asset_files(id) ON DELETE CASCADE,
  asset_role TEXT NOT NULL,
  title TEXT,
  alt_text TEXT,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  is_public INTEGER NOT NULL DEFAULT 1 CHECK (is_public IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (family_id, asset_role, sort_order)
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  tag_type TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE product_tags (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (product_id, tag_id)
);

CREATE TABLE seo_entries (
  id TEXT PRIMARY KEY,
  category_id TEXT REFERENCES catalog_categories(id) ON DELETE CASCADE,
  family_id TEXT REFERENCES product_families(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  route_path TEXT NOT NULL UNIQUE,
  canonical_path TEXT,
  meta_title TEXT,
  meta_description TEXT,
  og_title TEXT,
  og_description TEXT,
  og_image_asset_id TEXT REFERENCES asset_files(id) ON DELETE SET NULL,
  schema_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(schema_json)),
  noindex INTEGER NOT NULL DEFAULT 0 CHECK (noindex IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (category_id IS NOT NULL) +
    (family_id IS NOT NULL) +
    (product_id IS NOT NULL) = 1
  )
);

CREATE TABLE redirects (
  id TEXT PRIMARY KEY,
  source_path TEXT NOT NULL UNIQUE,
  target_path TEXT NOT NULL,
  status_code INTEGER NOT NULL DEFAULT 301 CHECK (status_code IN (301,302,307,308,410)),
  reason TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE project_enquiries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  company TEXT,
  enquiry_type TEXT NOT NULL,
  message TEXT NOT NULL,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  family_id TEXT REFERENCES product_families(id) ON DELETE SET NULL,
  category_id TEXT REFERENCES catalog_categories(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'new',
  source_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE technical_asset_requests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  company TEXT,
  request_type TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  source_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE technical_asset_request_items (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES technical_asset_requests(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  asset_id TEXT REFERENCES asset_files(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  CHECK ((product_id IS NOT NULL) + (asset_id IS NOT NULL) >= 1)
);

CREATE INDEX catalog_categories_environment_idx
  ON catalog_categories(environment,level,is_active);
CREATE INDEX product_families_code_idx
  ON product_families(family_code_normalized);
CREATE UNIQUE INDEX products_one_primary_variant_per_family_idx
  ON products(family_id) WHERE is_primary_variant=1 AND deleted_at IS NULL;
CREATE INDEX products_power_watts_idx
  ON products(power_watts);
CREATE INDEX product_spec_values_number_idx
  ON product_spec_values(spec_key,value_number,product_id) WHERE value_number IS NOT NULL;
CREATE INDEX product_assets_asset_idx
  ON product_assets(asset_id);
CREATE INDEX product_family_assets_family_idx
  ON product_family_assets(family_id,asset_role,sort_order);
CREATE INDEX product_family_assets_asset_idx
  ON product_family_assets(asset_id);
CREATE UNIQUE INDEX product_family_assets_one_primary_public_idx
  ON product_family_assets(family_id) WHERE is_primary=1 AND is_public=1;
CREATE INDEX product_tags_tag_idx
  ON product_tags(tag_id);
CREATE INDEX seo_entries_category_idx
  ON seo_entries(category_id);
CREATE INDEX seo_entries_family_idx
  ON seo_entries(family_id);
CREATE INDEX seo_entries_product_idx
  ON seo_entries(product_id);
CREATE INDEX seo_entries_og_image_asset_idx
  ON seo_entries(og_image_asset_id);
CREATE INDEX import_source_rows_category_idx
  ON import_source_rows(category_id);
CREATE INDEX import_source_rows_family_idx
  ON import_source_rows(family_id);
CREATE INDEX project_enquiries_product_idx
  ON project_enquiries(product_id);
CREATE INDEX project_enquiries_family_idx
  ON project_enquiries(family_id);
CREATE INDEX project_enquiries_category_idx
  ON project_enquiries(category_id);
CREATE INDEX technical_asset_request_items_request_idx
  ON technical_asset_request_items(request_id);
CREATE INDEX technical_asset_request_items_product_idx
  ON technical_asset_request_items(product_id);
CREATE INDEX technical_asset_request_items_asset_idx
  ON technical_asset_request_items(asset_id);
