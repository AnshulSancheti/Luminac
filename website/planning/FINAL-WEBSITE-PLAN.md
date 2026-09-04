# Luminac Final Website Plan

Date started: 2026-05-27  
Project: `luminac.net` website rebuild  
Status: Living plan

## Purpose

Build a clean, premium, secure Luminac website after the previous site was compromised. The rebuild must avoid carrying forward old WordPress/cPanel risk, preserve business-critical product data, and protect the domain before traffic reaches the application.

## Known History

- The previous website showed poker and NSFW spam links.
- The previous database was wiped.
- Public traces suggested WordPress/WooCommerce-style paths such as `/wp-content/uploads/` and `/shop/`.
- The old site, database, uploads, plugins, themes, credentials, and hosting environment must be treated as untrusted unless independently verified.

## Current Direction

- Avoid rebuilding as a traditional WordPress site unless the client explicitly requires it.
- Use a modern application stack with clean hosting, clean database credentials, and clean storage.
- Use Cloudflare as the domain edge: DNS, CDN, SSL, WAF, DDoS protection, DNSSEC, and rate limiting.
- Move the registrar from GoDaddy to Cloudflare after Cloudflare DNS is stable.
- Use Supabase as the managed backend for Postgres, Auth, Row Level Security, Storage policies, and backups.
- Use Cloudflare Pro as the launch security tier.
- Keep product/CAD/media uploads admin-only.
- Create the production Supabase project under a Luminac-owned organization where possible. If development starts in a developer-owned organization, transfer the project to the Luminac organization before launch.
- The Luminac/company-owned Supabase organization has been created. The earlier `ap-southeast-2` Sydney project was deleted, and the production project has been recreated in `ap-south-1` / Mumbai.
- Keep old site assets and data out of the new system unless they pass validation.

## Recommended Stack

- Frontend: Next.js.
- 3D/scroll experience: Three.js or React Three Fiber.
- Backend: Supabase for managed Postgres, Auth, Row Level Security, Storage policies, and backups.
- Storage: Supabase Storage for images, CAD files, IES files, PDFs, datasheets, and catalogues.
- Offsite asset backup/mirror: Cloudflare R2 or another S3-compatible bucket controlled separately from app runtime credentials.
- CDN/WAF: Cloudflare Pro at launch.
- Admin: custom protected dashboard, not public WordPress admin.
- Backups: managed database backups plus independent offsite exports.
- SEO: SSR/static product pages with clean slugs and a clean sitemap.

## Domain And Edge Decision

Decision: take domain edge control to Cloudflare.

Implementation path:

1. Export all DNS records from GoDaddy, especially email records.
2. Add `luminac.net` to Cloudflare.
3. Recreate required DNS records in Cloudflare.
4. Change GoDaddy nameservers to Cloudflare.
5. Enable Cloudflare SSL, WAF, DDoS protection, DNSSEC, rate limits, and monitoring.
6. Keep GoDaddy as registrar for 1-2 stable weeks.
7. Transfer the domain registrar from GoDaddy to Cloudflare Registrar.

GoDaddy paid security add-ons are not the long-term security path. Keep only essential registrar protections until transfer: MFA, unique password, domain lock, auto-renew, current contact email, and domain privacy if available.

Do not buy GoDaddy SSL, Premium DNS, or Website Security for the clean rebuild unless the old compromised site must remain temporarily online and needs emergency containment.

## Cloudflare Baseline

- Cloudflare account MFA.
- Cloudflare Pro during launch for stronger managed WAF coverage.
- Minimal DNS records. Remove legacy hosting, parked, wildcard, and forgotten records.
- Web traffic proxied through Cloudflare.
- SSL mode: `Full (strict)` once origin certificates are correct.
- HTTPS redirect enabled.
- Managed WAF rules enabled.
- Rate limits and challenges for:
  - Admin login.
  - Password reset.
  - Product write APIs.
  - Import APIs.
  - Media upload APIs.
  - Contact and quote forms.
  - Catalogue/download lead forms.
  - High-cardinality search endpoints.
- DNSSEC after DNS is stable.
- HSTS only after HTTPS works correctly for all required subdomains.
- Security headers: CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, frame protection, and `Permissions-Policy`.
- Monitor DNS changes, WAF events, traffic spikes, origin errors, and admin/API attack patterns.

## Website Security Baseline

The website must be built as if it will be attacked again.

Selected defaults:

- Supabase organization owner: Luminac/client-owned account for production.
- Developer access: invite named developers into the organization; remove access after handoff.
- Supabase Auth for managed admin authentication.
- Invite-only admin accounts. Public signup disabled.
- MFA required for owner, admin, and editor accounts.
- Roles: owner, admin, editor, viewer.
- Authorization enforced server-side in API routes and database-side with Supabase Row Level Security.
- Admin uploads only. No public file upload forms.
- Secure server-managed sessions using `HttpOnly`, `Secure`, and `SameSite` cookies.
- CSRF protection for cookie-authenticated mutations.
- Schema validation on every API request.
- Parameterized queries or Supabase query APIs only.
- Audit logs for login, MFA, role, product, import, upload, publish, and backup/restore events.
- Strict secret handling. No service-role keys, database credentials, storage admin keys, or migration credentials in browser code.
- Dependency scan, secret scan, lockfile review, and security header scan before launch.
- Restore-tested backups before production launch.

Implementation detail lives in [security-features.md](security-features.md).

## Product Catalogue

The site must support roughly 400 lighting products.

Current spreadsheet source fields include model number, size, body colour, CCT/beam degree for indoor products, power/light source for outdoor products, MRP, and image placeholders. These spreadsheet files are source inputs only; they are not the production database.

Storage decision:

- Product details and searchable specs live in Supabase Postgres.
- Product images, application images, CAD, IES, PDFs, datasheets, and catalogues live in Supabase Storage.
- The database stores only asset metadata and object keys, not binary files.
- A separate Cloudflare R2 or S3-compatible bucket is used for offsite asset backup/mirroring.
- Use generated object keys, not original filenames or user-controlled paths.

Current source extraction:

- `Catalogues/INDOOR  New price 2026.xlsx`: 32 product rows across 6 category bands.
- `Catalogues/OUTDOOR New price 2026.xlsx`: 46 product rows across 6 category bands.
- Embedded images exist in both workbooks. Outdoor has one image anchor per product row. Indoor needs image QA because rows 9, 13, and 41 have no detected image anchor and row 12 has duplicate image anchors.
- Current extracted product inventory lives in [catalogue-product-inventory.md](catalogue-product-inventory.md).
- Current relational schema and import mapping live in [product-database-schema.md](product-database-schema.md).

Core product data:

- Global product registry.
- Indoor/outdoor subcategory product tables.
- Product category index.
- Tags.
- Product-tag mappings.
- Optional product extra fields.
- Product-level finish, CCT, beam, wattage, dimensions, cutout, light source, IP rating, and MRP fields.
- Future SKU expansion tables only when exact sellable combinations are confirmed.
- Applications.
- Product photos.
- CAD files.
- IES files.
- Datasheets.
- Audit logs.

Data requirements:

- Supabase Row Level Security enabled for all exposed tables.
- Public users can read only published product data.
- Admin/editor writes must pass role checks in server routes and RLS policies.
- Unique slugs.
- Foreign key constraints.
- Admin-only mutations.
- Soft deletes for products and assets.
- Import batch tracking.
- Version history or audit logs for admin changes.
- Separate credentials for runtime, migrations, backups, and read-only analytics.

## Media And CAD Security

Uploads are a high-risk area because the old compromise may have involved executable upload paths.

Rules:

- Allowlisted file types only.
- Validate extension, MIME type, file signature, size, and asset category.
- Rename files server-side.
- Store uploads outside the app runtime.
- Never allow uploaded content to execute.
- No public write buckets.
- No direct rendering of unsafe uploaded HTML/SVG.
- Use object storage/CDN.
- Use malware scanning or quarantine where possible.
- Generate optimized image variants.
- Track asset metadata in the database.
- Serve CAD downloads with safe content headers, normally as attachments.

## Incident Recovery And SEO

- Do not reuse old WordPress users, sessions, plugin settings, transient data, unknown post meta, password hashes, or executable upload folders.
- Pull hacked/spam URLs from Google Search Console, old sitemaps, server logs, and search queries.
- Return `410 Gone` for confirmed spam URLs that never belonged to Luminac.
- Return `404` when unsure.
- Do not redirect spam URLs to the homepage.
- Publish a clean sitemap after launch and request recrawl.

## Backup And Disaster Recovery

Because the previous database was wiped, backups are launch-critical.

Required controls:

- Automated daily database backups.
- Point-in-time recovery where the provider supports it.
- Offsite logical exports.
- Object storage versioning or independent asset copies.
- Backup credentials separate from app runtime credentials.
- Backup monitoring.
- Restore drills.
- Recovery runbook.

Suggested defaults:

- RPO: maximum 24 hours of product/admin data loss.
- RTO: public product catalogue restored within 4 business hours.

## Open Decisions

- Confirm whether the old site must be preserved for evidence or can be fully retired.
- Confirm whether CAD files should be public, dealer-only, or request-gated.
- Confirm product import source and workflow from the Excel catalogues.
- Confirm Google Search Console access for hacked URL cleanup.
- Confirm exact production, staging, preview, and admin hostnames.

## Supporting Documents

- [domain-edge-security.md](domain-edge-security.md)
- [catalogue-product-inventory.md](catalogue-product-inventory.md)
- [product-storage-architecture.md](product-storage-architecture.md)
- [product-database-schema.md](product-database-schema.md)
- [security-features.md](security-features.md)
- [supabase-setup-checklist.md](supabase-setup-checklist.md)
- [incident-recovery-and-seo.md](incident-recovery-and-seo.md)
