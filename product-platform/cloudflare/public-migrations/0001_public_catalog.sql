-- Internet-facing catalogue projection. This schema intentionally omits
-- private, administrative, import-provenance, pricing, and audit data.

PRAGMA foreign_keys = ON;

CREATE TABLE catalog_categories (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES catalog_categories(id),
  level TEXT NOT NULL CHECK (level IN ('environment','subcategory','product_category')),
  environment TEXT NOT NULL CHECK (environment IN ('indoor','outdoor')),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  full_slug TEXT NOT NULL UNIQUE,
  route_path TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (parent_id, slug)
);

CREATE TABLE product_families (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES catalog_categories(id),
  environment TEXT NOT NULL CHECK (environment IN ('indoor','outdoor')),
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  series_label TEXT,
  short_description TEXT,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0,1))
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES product_families(id),
  model_no TEXT NOT NULL,
  model_no_normalized TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  variant_label TEXT,
  power_text TEXT,
  power_watts REAL,
  is_primary_variant INTEGER NOT NULL DEFAULT 0 CHECK (is_primary_variant IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (family_id, model_no_normalized)
);

CREATE TABLE indoor_product_details (
  product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  size_text TEXT,
  cutout_text TEXT,
  finish_text TEXT,
  cct_text TEXT,
  beam_angle_text TEXT,
  light_source TEXT,
  ip_rating TEXT,
  cri INTEGER
);

CREATE TABLE outdoor_product_details (
  product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  size_text TEXT,
  finish_text TEXT,
  cct_text TEXT,
  light_source TEXT,
  ip_rating TEXT
);

CREATE TABLE product_spec_values (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  spec_key TEXT NOT NULL,
  spec_label TEXT NOT NULL,
  value_text TEXT NOT NULL,
  value_normalized TEXT NOT NULL,
  value_number REAL,
  unit TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (product_id, spec_key, value_normalized)
);

CREATE TABLE product_extra_fields (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  field_group TEXT NOT NULL DEFAULT 'general',
  field_key TEXT NOT NULL,
  field_label TEXT NOT NULL,
  value_text TEXT NOT NULL,
  value_number REAL,
  unit TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (product_id, field_key)
);

CREATE TABLE asset_files (
  id TEXT PRIMARY KEY,
  storage_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0)
);

CREATE TABLE product_assets (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES asset_files(id) ON DELETE CASCADE,
  asset_role TEXT NOT NULL DEFAULT 'product',
  variant TEXT,
  title TEXT,
  alt_text TEXT,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  is_public INTEGER NOT NULL DEFAULT 1 CHECK (is_public IN (0,1)),
  UNIQUE (product_id, asset_role, sort_order)
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
  UNIQUE (family_id, asset_role, sort_order)
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  tag_type TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE product_tags (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
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
  CHECK ((category_id IS NOT NULL) + (family_id IS NOT NULL) + (product_id IS NOT NULL) = 1)
);

CREATE TABLE redirects (
  id TEXT PRIMARY KEY,
  source_path TEXT NOT NULL UNIQUE,
  target_path TEXT NOT NULL,
  status_code INTEGER NOT NULL DEFAULT 301 CHECK (status_code IN (301,302,307,308,410)),
  reason TEXT
);

CREATE INDEX catalog_categories_parent_sort_idx ON catalog_categories(parent_id, sort_order);
CREATE INDEX product_families_category_sort_idx ON product_families(category_id, sort_order);
CREATE INDEX products_family_sort_idx ON products(family_id, sort_order);
CREATE INDEX products_model_idx ON products(model_no_normalized);
CREATE INDEX products_power_idx ON products(power_watts);
CREATE INDEX product_spec_values_product_idx ON product_spec_values(product_id, sort_order);
CREATE INDEX product_spec_values_lookup_idx ON product_spec_values(spec_key, value_normalized, product_id);
CREATE INDEX product_extra_fields_product_idx ON product_extra_fields(product_id, sort_order);
CREATE INDEX product_assets_product_idx ON product_assets(product_id, asset_role, sort_order);
CREATE UNIQUE INDEX product_assets_one_primary_idx ON product_assets(product_id) WHERE is_primary=1 AND is_public=1;
CREATE INDEX product_family_assets_family_idx ON product_family_assets(family_id, asset_role, sort_order);
CREATE INDEX product_tags_tag_idx ON product_tags(tag_id);
CREATE INDEX seo_entries_category_idx ON seo_entries(category_id);
CREATE INDEX seo_entries_family_idx ON seo_entries(family_id);
CREATE INDEX seo_entries_product_idx ON seo_entries(product_id);

