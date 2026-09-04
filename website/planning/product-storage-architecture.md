# Product Storage Architecture

Date: 2026-05-27  
Project: `luminac.net`  
Decision: Supabase Postgres for product data, Supabase Storage for product assets, Cloudflare R2/S3-compatible bucket for offsite asset backup or future heavy-download migration.

## Recommendation

Do not store products as pages, Excel rows, JSON blobs, or image folders alone.

Use three layers:

1. Supabase Postgres stores structured product data.
2. Supabase Storage stores binary assets: product images, application images, CAD drawings, IES/LDT files, PDFs, datasheets, and catalogues.
3. Cloudflare R2 or another S3-compatible bucket stores offsite asset backups and can later become the primary CAD/media delivery store if download volume becomes large.

This keeps product data searchable and relational while keeping large files out of the database and outside the app runtime.

## Why This Is The Best Fit

- Supabase is already the chosen backend for Auth, Postgres, RLS, Storage policies, and backups.
- Supabase Storage supports public/private buckets, signed URLs, RLS-backed access control, image transformations, resumable uploads, and CDN delivery.
- Product details need relational structure for filtering, search, categories, specs, variants, slugs, imports, audit logs, and restore.
- CAD files and application images are binary files and should be stored in object storage, not in Postgres.
- Cloudflare R2 is useful as a separate backup/mirror because it is S3-compatible, works well with Cloudflare, and avoids egress fees for future heavy public downloads.

References:

- Supabase Storage: https://supabase.com/docs/guides/storage
- Supabase Storage buckets: https://supabase.com/docs/guides/storage/buckets/fundamentals
- Supabase Storage access control: https://supabase.com/docs/guides/storage/security/access-control
- Supabase Storage image transformations: https://supabase.com/docs/guides/storage/image-transformations
- Supabase database backups: https://supabase.com/docs/guides/platform/backups
- Cloudflare R2: https://www.cloudflare.com/products/r2/
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/

## Store What Where

| Data | Primary Location | Notes |
| --- | --- | --- |
| Product identity, model number, title, slug, category, collection, status | Supabase Postgres | Canonical product record. |
| Spreadsheet details such as size, body colour, CCT, beam degree, power, light source, MRP | Supabase Postgres | Normalize into variants/specs/pricing fields. |
| Search/filter data | Supabase Postgres | Supports category, application, mounting, wattage, CCT, CRI, beam angle, IP rating, finish, and collection filters. |
| Primary product image | Supabase Storage | Store optimized public variants plus original source metadata. |
| 1-2 application images | Supabase Storage | Linked in `product_assets` with sort order. |
| CAD drawings | Supabase Storage private bucket by default | Serve by signed URL or public download policy after business decision. |
| IES/LDT files | Supabase Storage private bucket by default | Treat as technical downloads. |
| Datasheets/catalogues/PDFs | Supabase Storage | Public or private depending on lead/dealer strategy. |
| File metadata | Supabase Postgres | Type, bucket, object key, MIME, size, checksum, visibility, status. |
| Offsite file backup | Cloudflare R2 or S3-compatible bucket | Separate credentials from app runtime. |

## Database Model

Minimum tables:

- `product_registry`: stable product ID, model number, slug, environment, category pointer, status, and fast asset pointers.
- `product_category_index`: indoor/outdoor category, subcategory, product category, and target product table routing.
- Indoor/outdoor subcategory product tables: product-level wattage, CCT, beam angle, finish, light source, IP rating, dimensions, cutout, price/MRP, raw Excel values, and parsed filter values.
- `product_extra_fields`: flexible key/value specs that do not fit stable product table fields.
- `tags`: application, mounting, style, finish, sector, feature, and collection tags.
- `product_tags`: many-to-many product/tag mapping.
- `product_assets`: asset metadata and object storage keys.
- `import_batches`: source file, run date, status, counts, warnings, errors.
- `audit_logs`: admin/import/product/asset changes.

Rules:

- Use UUIDs as primary keys.
- Keep model numbers as unique business identifiers where possible, not primary keys.
- Enforce unique slugs.
- Use foreign keys and delete restrictions.
- Use soft delete for products and assets.
- Enable Supabase Row Level Security on exposed tables.
- Public users can read only published products and approved public assets.
- Admin/editor writes must pass server-side authorization and RLS policies.

## Asset Buckets

Recommended buckets:

- `product-public`: published images and public datasheets.
- `product-private`: CAD, IES/LDT, dealer-only assets, original source files, unpublished assets.
- `product-quarantine`: newly uploaded files before validation/review.
- `product-backup`: optional offsite mirror in Cloudflare R2 or S3-compatible storage, not writable by app runtime.

Bucket rules:

- No public write buckets.
- Uploads are admin-only.
- Private buckets require RLS policies or signed URLs.
- Public buckets allow read access but still require admin-only write/update/delete access.
- Store only generated object keys, never raw original filenames as paths.
- Keep file checksums for backup and restore verification.

## Object Key Pattern

Use generated keys:

```text
products/{product_uuid}/{asset_kind}/{asset_uuid}.{ext}
```

Examples:

```text
products/0f3.../primary-image/9ad...webp
products/0f3.../application-image/f17...webp
products/0f3.../cad/2cb...dwg
products/0f3.../datasheet/a31...pdf
```

Do not trust or expose original filenames as storage paths. Original filenames can be stored as metadata for admin reference only.

## Import Flow From Excel

1. Keep original Excel files read-only as source artifacts.
2. Convert/parse into an import staging format.
3. Normalize fields such as model number, size, body colour, CCT, degree, power, light source, MRP, category, and tags.
4. Create/update products and variants using deterministic slugs and stable model numbers.
5. Link product images, application images, CAD, IES, and PDFs through `product_assets`.
6. Run dry-run validation before writing production data.
7. Record import batch counts, warnings, errors, and rollback metadata.

## Asset Upload Flow

1. Admin/editor uploads through the protected dashboard.
2. File lands in `product-quarantine`.
3. Server validates extension, MIME type, file signature, size, product relation, and asset category.
4. Server renames the file with a generated UUID key.
5. Images are optimized into WebP/AVIF variants.
6. Metadata and checksum are saved to `product_assets`.
7. Asset stays draft until reviewed/published.
8. Published public files move to `product-public`; private technical files stay in `product-private`.
9. Backup job mirrors critical assets to Cloudflare R2/S3-compatible storage.

## CAD And Download Policy

Default: keep CAD files private until the business decides whether they are public, dealer-only, or request-gated.

If CAD files are public:

- Serve through controlled download URLs.
- Use `Content-Disposition: attachment`.
- Track download counts.
- Rate-limit bulk downloads.

If CAD files are dealer-only or request-gated:

- Use signed URLs with short expiry.
- Log actor, product, asset, timestamp, and result.
- Never expose bucket listing.

## Backup And Restore

Database backup alone is not enough. A restored product catalogue must include records and files.

Required:

- Supabase database backups.
- Offsite logical database export.
- Asset inventory with bucket, object key, checksum, size, and asset status.
- Offsite asset mirror in Cloudflare R2 or S3-compatible storage.
- Restore drill for one complete product page with primary image, application images, datasheet, CAD, specs, tags, variants, and SEO metadata.

Defaults:

- RPO: maximum 24 hours of product/admin data loss.
- RTO: public product catalogue restored within 4 business hours.

## Future Migration Trigger

Keep Supabase Storage as the primary V1 asset store.

Move public CAD/media delivery to Cloudflare R2 if any of these happen:

- CAD downloads become high-volume.
- Storage egress costs become material.
- The site needs all public assets under `assets.luminac.net` with Cloudflare cache/WAF controls.
- The asset library grows far beyond the initial catalogue.
