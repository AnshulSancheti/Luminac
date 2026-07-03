# Supabase Setup Checklist

Date: 2026-05-27  
Project: `luminac.net`  
Status: Company-owned Supabase organization created; production project recreated in Mumbai

## Immediate Next Steps

1. Enable MFA on the company-owned Supabase login.
2. Add at least one backup company owner account so the organization is not locked to one person.
3. Invite developer accounts by name, not shared credentials.
4. Use least-privilege roles: Owner only for company principals, Administrator only where needed, Developer for implementation work.
5. Add billing/payment before production data is stored.
6. Confirm the Mumbai project's database password is stored in the company password manager.

## Region Choice

Supabase projects are deployed to one primary region, and changing region later requires creating a new project and migrating.

Confirmed production region:

- `ap-south-1` / South Asia / Mumbai.

Reason:

- Best fit for an India-focused Luminac site and admin team.

Rejected region:

- `ap-southeast-2` / Oceania / Sydney project was deleted before real product data or production assets were imported.

Fallback guidance:

- Use `South Asia (Mumbai)` if Luminac's primary users/admins are in India.
- Use `Southeast Asia (Singapore)` if the site must balance India, Southeast Asia, and Middle East latency.
- Avoid `ap-southeast-2` for production unless Mumbai/Singapore are unavailable and the latency tradeoff is accepted.

References:

- Supabase regions: https://supabase.com/docs/guides/platform/regions
- Supabase region change: https://supabase.com/docs/guides/troubleshooting/change-project-region-eWJo5Z

## Project Creation

Production project is created inside the Luminac-owned organization in Mumbai.

Recommended project naming:

- Organization: `Luminac`
- Production project: `luminac-prod`
- Future staging project: `luminac-staging`
- Local development: local Supabase or isolated developer project, never production.

Project creation rules:

- Generate a strong database password.
- Store the database password in the company password manager.
- Do not send the database password over chat/email.
- Do not reuse this password anywhere else.
- Keep production separate from staging/preview.

## Plan And Billing

Production should not run long-term on the Free plan because the project needs reliable backups, no unexpected pausing, and enough storage/egress headroom for images/CAD files.

Default:

- Use Free only for initial exploration if no real product data is stored.
- Upgrade the production organization/project to Pro before importing real product data or uploads.
- Revisit Point-in-Time Recovery once product import/admin editing begins.

References:

- Supabase billing: https://supabase.com/docs/guides/platform/billing-on-supabase
- Supabase backups: https://supabase.com/docs/guides/platform/backups

## API Keys And Secrets

Rules:

- Use the publishable key only in public browser code.
- Use secret/service-role keys only on trusted server-side code.
- Never expose elevated keys in browser bundles, screenshots, public repos, chat, email, or logs.
- Store keys in deployment platform secrets, not in committed `.env` files.
- Separate production, staging, migration, backup, and read-only analytics credentials.

Reference:

- Supabase API keys: https://supabase.com/docs/guides/getting-started/api-keys

## Auth Setup

Production defaults:

- Disable public signup.
- Use invite-only admin accounts.
- Require MFA for owner, admin, and editor users.
- Define application roles: owner, admin, editor, viewer.
- Enforce authorization in server routes and Supabase RLS policies.

References:

- Supabase Auth MFA: https://supabase.com/docs/guides/auth/auth-mfa
- Supabase platform MFA: https://supabase.com/docs/guides/platform/multi-factor-authentication
- Supabase access control: https://supabase.com/docs/guides/platform/access-control

## Database Setup

Before importing products:

- Create migrations for all schema changes.
- Enable RLS on exposed tables.
- Create policies for public published reads and admin/editor writes.
- Create tables for products, categories, variants, specs, tags, product assets, import batches, and audit logs.
- Use UUID primary keys.
- Enforce unique slugs and foreign keys.
- Use soft delete for products and assets.

Reference:

- Supabase database migrations: https://supabase.com/docs/guides/deployment/database-migrations

## Storage Setup

Create buckets:

- `product-public`
- `product-private`
- `product-quarantine`

Rules:

- No public write buckets.
- Admin-only uploads.
- Private buckets require RLS policies or signed URLs.
- Validate extension, MIME type, file signature, size, and asset type before publish.
- Store generated object keys in Postgres, not original filenames as paths.
- Mirror critical assets to Cloudflare R2 or another S3-compatible backup bucket.

## Launch Gate

Before production launch:

- Supabase org MFA and backup owner confirmed.
- Production project exists in confirmed region.
- Billing/Pro plan confirmed for production.
- RLS enabled and tested.
- Storage buckets and policies tested.
- Public signup disabled.
- Admin MFA tested.
- Service/secret keys absent from browser bundle and repository history.
- Database backup configured.
- Offsite export/asset backup configured.
- Restore drill completed.
