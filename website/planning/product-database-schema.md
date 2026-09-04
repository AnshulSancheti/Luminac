# Product Database Schema

Date: 2026-07-02
Project: `luminac.net`
Target: Supabase Postgres plus Supabase Storage

## Direction

The product database is no longer SKU-first.

For V1, each row in the master catalogue becomes one product record. Values such as finish, CCT, beam angle, wattage, dimensions, cutout, light source, IP rating, and MRP are stored on that product record as product-level catalogue data. If a field contains multiple options, such as `White/Black` or `3k/4k`, keep the exact source text and optionally store parsed values for search/filtering.

Future SKU support should be possible without changing the public product identity. To make that possible:

- Every product gets a stable `product_id`.
- Raw spreadsheet values are preserved.
- Parsed multi-option values can be stored in JSONB fields or generated option tables.
- Future SKU tables can reference `product_id` and split one product into exact sellable combinations later.

## Master Excel Columns

Current workbook:

`Catalogues/product-data/Luminac Master Data Sheet.xlsx`

Current sheet:

`Catalogue Review`

Expected upload columns:

```text
Product Image
CAD / Line Drawing
Model No
Category
Sub Category
Product Category
Power
Size
Cutout
Finish
CCT
Beam Angle
Light Source
IP Rating
MRP
Short Description
```

`Short Description` is recommended for website readiness, but product rows can be imported as draft before it exists.

## Table Layout

The database separates catalogue products by environment and subcategory, while keeping shared helper tables for assets, optional specs, imports, and future SKU expansion.

### Shared Lookup Tables

#### `product_category_index`

Canonical category registry used by the uploader and admin UI.

```text
id uuid primary key
environment text not null -- indoor, outdoor
category text not null -- Indoor Lighting, Outdoor Lighting
subcategory text not null -- Recessed, Wall Light, Bollards, etc.
product_category text null -- Cob Down Lights, Wall Washers, etc.
target_table text not null -- e.g. indoor_recessed_products
slug text not null unique
sort_order integer not null default 0
is_active boolean not null default true
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Recommended uniqueness:

```text
unique(environment, subcategory, product_category)
```

#### `product_registry`

One global row per product. This avoids losing cross-category search, stable asset linking, imports, redirects, and future SKU support even though detailed product data lives in subcategory tables.

```text
id uuid primary key
environment text not null -- indoor, outdoor
category_index_id uuid not null references product_category_index(id)
source_table text not null
model_no text not null
model_no_normalized text not null
slug text not null unique
display_name text not null
status text not null default 'draft' -- draft, published, archived, discontinued
primary_asset_id uuid null
line_drawing_asset_id uuid null
source_file text null
source_sheet text null
source_row_number integer null
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
deleted_at timestamptz null
```

Recommended indexes:

```text
index(environment, status)
index(category_index_id)
index(model_no_normalized)
```

Do not make `model_no_normalized` globally unique until duplicate model rows are reviewed. Use `product_registry.id` as the stable identity.

## Product Detail Tables

Each subcategory table stores the full product row for that subcategory. The base columns should be identical across these tables so the importer can use one common mapping.

Example tables:

```text
indoor_recessed_products
indoor_step_light_products
indoor_wall_products
indoor_pendant_products
indoor_architectural_surface_products
indoor_recessed_decorative_products
outdoor_wall_light_products
outdoor_hanging_products
outdoor_gate_light_products
outdoor_ceiling_surface_products
outdoor_bollard_products
outdoor_step_light_products
```

Base columns for every product detail table:

```text
id uuid primary key
product_id uuid not null unique references product_registry(id)
category_index_id uuid not null references product_category_index(id)
model_no text not null
model_no_normalized text not null
slug text not null
product_category text null
power text null
power_watts numeric null
size text null
cutout text null
finish text null
finish_values jsonb not null default '[]'
cct text null
cct_values jsonb not null default '[]'
beam_angle text null
beam_angle_values jsonb not null default '[]'
light_source text null
ip_rating text null
mrp_inr integer null
short_description text null
description text null
search_text tsvector null
raw_excel_values jsonb not null
parsed_values jsonb not null default '{}'
status text not null default 'draft'
sort_order integer not null default 0
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
deleted_at timestamptz null
```

Subcategory-specific columns can be added only where useful. Examples:

- Recessed products: `mounting_type`, `trim_type`, `recess_depth`.
- Outdoor products: `weather_resistance_notes`, `mounting_surface`.
- Bollards: `height_mm`, `base_diameter_mm`.
- Step lights: `orientation`, `recess_box_size`.

Use subcategory columns only when the value is common enough to filter, sort, or display consistently for that subcategory.

## Optional Per-Product Data

Fields that are not common enough for a main table belong here.

### `product_extra_fields`

```text
id uuid primary key
product_id uuid not null references product_registry(id)
field_group text not null default 'general'
field_key text not null
field_label text not null
value_text text not null
value_number numeric null
unit text null
sort_order integer not null default 0
created_at timestamptz not null default now()
```

Examples:

- CRI
- voltage
- material
- driver type
- dimming type
- warranty
- installation notes
- unusual optics
- custom product notes

Recommended uniqueness:

```text
unique(product_id, field_key)
```

## Assets

Binary files live in Supabase Storage. Postgres stores metadata and pointers only.

Suggested buckets:

```text
product-images
product-line-drawings
product-application-images
product-datasheets
product-cad
```

### `product_assets`

```text
id uuid primary key
product_id uuid not null references product_registry(id)
asset_type text not null -- primary_image, line_drawing, application_image, gallery_image, datasheet_pdf, cad_file
bucket text not null
storage_key text not null
public_url text null
title text null
alt_text text null
original_filename text null
mime_type text null
size_bytes bigint null
checksum_sha256 text null
width integer null
height integer null
sort_order integer not null default 0
status text not null default 'draft'
source_file text null
source_sheet text null
source_row_number integer null
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
deleted_at timestamptz null
```

Recommended constraints:

```text
unique(bucket, storage_key)
unique(product_id, asset_type, sort_order)
partial unique one primary_image per active product
partial unique one line_drawing per active product
```

The product tables should not store many asset columns. Use `product_registry.primary_asset_id` and `product_registry.line_drawing_asset_id` for fast access, and use `product_assets` for full galleries and files.

## Import Tables

### `import_batches`

```text
id uuid primary key
source_file text not null
source_file_checksum text null
source_kind text not null default 'xlsx'
status text not null -- dry_run, applied, failed, rolled_back
started_at timestamptz not null default now()
finished_at timestamptz null
total_rows integer not null default 0
valid_rows integer not null default 0
invalid_rows integer not null default 0
products_created integer not null default 0
products_updated integer not null default 0
assets_linked integer not null default 0
warnings jsonb not null default '[]'
errors jsonb not null default '[]'
```

### `import_source_rows`

```text
id uuid primary key
import_batch_id uuid not null references import_batches(id)
source_file text not null
source_sheet text not null
source_row_number integer not null
target_table text null
product_id uuid null references product_registry(id)
model_no text null
raw_values jsonb not null
normalized_values jsonb not null default '{}'
status text not null -- pending, valid, warning, invalid, imported
warnings jsonb not null default '[]'
errors jsonb not null default '[]'
created_at timestamptz not null default now()
```

Recommended uniqueness:

```text
unique(import_batch_id, source_sheet, source_row_number)
```

## Future SKU Support

Do not create SKU rows during the V1 import. Keep future support by adding these tables later:

### `product_option_values`

Stores parsed possible values from a product field without claiming those combinations are real sellable SKUs.

```text
id uuid primary key
product_id uuid not null references product_registry(id)
option_type text not null -- finish, cct, beam_angle, power
raw_source_text text not null
option_label text not null
normalized_value text null
unit text null
sort_order integer not null default 0
created_at timestamptz not null default now()
```

### `product_skus`

Only create this when the business is ready to define exact purchasable combinations.

```text
id uuid primary key
product_id uuid not null references product_registry(id)
sku text not null unique
label text null
power_value text null
finish_value text null
cct_value text null
beam_angle_value text null
mrp_inr integer null
status text not null default 'draft'
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

This keeps the future path open without forcing SKU partitioning now.

## Upload Workflow

1. Read the workbook sheet `Catalogue Review`.
2. Skip section header rows such as `INDOOR RECESSED`.
3. Validate required fields: `Model No`, `Category`, `Sub Category`, and at least one technical field.
4. Use `Category`, `Sub Category`, and `Product Category` to find or create a `product_category_index` row.
5. Use `product_category_index.target_table` to route the row into the correct subcategory product table.
6. Create or update `product_registry`.
7. Create or update the subcategory detail row.
8. Store the original row in `import_source_rows.raw_values`.
9. Parse helpful values into `parsed_values`, `finish_values`, `cct_values`, and `beam_angle_values`.
10. Upload product images and line drawings to Supabase Storage.
11. Create `product_assets` rows and set `primary_asset_id` / `line_drawing_asset_id` on `product_registry`.
12. Import rows as `draft`.
13. Publish only after image, category, description, and asset metadata are reviewed.

## Excel Changes For Seamless Upload

Add or standardize these columns:

```text
Row ID
Status
Environment
Short Description
Image Filename
Line Drawing Filename
Application Image Filenames
Datasheet Filename
Notes
```

Recommended rules:

- Keep column names exact and stable.
- Use `Indoor Lighting` or `Outdoor Lighting` in `Category`.
- Use controlled names for `Sub Category`.
- Keep `Product Category` as the third category level.
- Use one product per row.
- Do not merge cells.
- Do not rely on embedded images alone; add filename columns so uploads can match assets reliably.
- Keep MRP numeric with no currency symbol.
- Preserve raw values like `White/Black`, `3k/4k`, and `(2700k - 6000k) Tunable Dimmable`; the importer can parse them but should not split them into SKUs yet.
- Put unusual specs in `Notes` first, then map recurring specs into `product_extra_fields`.

## Validation Rules

Required:

- `Model No`
- `Category`
- `Sub Category`
- At least one of `Power`, `Size`, `Cutout`, `Finish`, `CCT`, `Beam Angle`, `Light Source`, `IP Rating`, or `MRP`

Warnings:

- Missing `Product Category`
- Missing `MRP`
- Missing image filename
- Missing line drawing filename
- Duplicate `Model No`
- Unparseable MRP
- Unknown category/subcategory combination
- Embedded image exists but no filename is provided

Critical errors:

- Blank model number
- Target subcategory table does not exist
- Asset file cannot be found during publish
- Duplicate slug collision after normalization

## Security Direction

- Enable RLS on all exposed tables.
- Public users can read only published products and published public assets.
- Import tables, drafts, asset quarantine rows, and audit logs are admin/server-only.
- Supabase Storage policies should separate public published assets from private or draft uploads.
- Use server-side import code with the service role. Never expose service role keys to the browser.
