# Website Security Features Plan

Date: 2026-05-27  
Project: `luminac.net`  
Security tier: Strong Practical  
Chosen backend: Supabase  
Chosen edge: Cloudflare Pro at launch

## Purpose

This document defines the security features that must be built into the Luminac website so the previous disaster does not repeat: spam injection, compromised uploads, weak admin access, and database loss.

Primary guidance:

- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- OWASP Top 10: https://owasp.org/Top10/
- OWASP API Security Top 10: https://owasp.org/API-Security/
- OWASP Cheat Sheet Series: https://cheatsheetseries.owasp.org/
- NIST Secure Software Development Framework: https://csrc.nist.gov/pubs/sp/800/218/final
- CISA backup guidance: https://www.cisa.gov/audiences/small-and-medium-businesses/secure-your-business/back-up-business-data
- Google hacked spam guidance: https://developers.google.com/search/docs/essentials/spam-policies
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase MFA: https://supabase.com/docs/guides/auth/auth-mfa
- Cloudflare WAF: https://developers.cloudflare.com/waf/
- Cloudflare rate limiting: https://developers.cloudflare.com/waf/rate-limiting-rules/

## Authentication

- Use Supabase Auth.
- Disable public signup.
- Create admin/editor/viewer accounts by invite only.
- Require MFA for owner, admin, and editor accounts.
- Require high-assurance auth before accessing admin routes or performing privileged mutations.
- Use secure server-managed sessions with `HttpOnly`, `Secure`, and `SameSite` cookies.
- Do not store tokens in `localStorage`.
- Keep admin routes separate from public pages.
- Add rate limits and Cloudflare challenges to login and password reset endpoints.

## Authorization

Roles:

- `owner`: full control, including roles, billing/security settings, destructive recovery actions.
- `admin`: product, import, media, and content management.
- `editor`: product/content/media edits without role or infrastructure control.
- `viewer`: read-only admin access for review.

Rules:

- Enforce authorization server-side on every write route.
- Enforce authorization database-side with Supabase Row Level Security.
- Never rely on hidden buttons, frontend-only checks, or obscured URLs.
- Public users can read only published products and public assets.
- Draft products, private CAD files, import jobs, audit logs, and admin metadata require authenticated role checks.

## API And Input Safety

- Validate every request body, query string, route param, and uploaded metadata with schemas.
- Prefer Zod for Next.js request validation.
- Reject unknown fields by default on mutation routes.
- Use parameterized queries and Supabase query APIs only.
- Treat product names, descriptions, slugs, tags, specs, SEO fields, search terms, spreadsheet values, and metadata as untrusted.
- Sanitize rich text before rendering.
- Escape output according to context.
- Protect cookie-authenticated mutations against CSRF.
- Return generic user-facing errors.
- Log detailed server-side errors without secrets, tokens, raw passwords, or private keys.

## Product Admin Safety

- Product create/update/delete/import actions require authenticated admin/editor roles.
- Use soft delete for products and assets.
- Keep import batch tracking for catalogue imports.
- Keep audit logs for every product mutation.
- Validate slugs, SEO metadata, and rich text to prevent spam injection.
- Prevent arbitrary remote URLs from being used by image, 3D, or asset loaders.
- Avoid rendering uploaded HTML/SVG. SVG is blocked unless separately sanitized and explicitly approved.

## Upload And Asset Security

Uploads are admin-only.

Allowed asset classes:

- Product images: JPG, PNG, WebP, AVIF.
- Documents: PDF datasheets, installation guides, catalogues.
- Lighting data: IES/LDT if needed.
- CAD/design: DWG, DXF, STEP/STP, SKP only if business-required.
- 3D web assets: GLB, GLTF, KTX2 only from trusted admin/build workflows.

Blocked by default:

- PHP, JS, HTML, SVG, shell scripts, executables, archives, and unknown binary files.

Required upload pipeline:

1. Authenticate admin/editor.
2. Authorize asset action for the target product.
3. Validate extension, MIME type, file signature, size, and asset category.
4. Rename server-side using a generated key.
5. Store in Supabase Storage, not the app runtime.
6. Compute checksum and save metadata.
7. Quarantine or scan where malware scanning is available.
8. Generate optimized image variants.
9. Keep draft status until reviewed/published.
10. Serve public assets through CDN with safe content headers.

Storage rules:

- No public write buckets.
- Separate public and private/dealer-only assets.
- No user-controlled storage paths.
- CAD downloads use `Content-Disposition: attachment`.
- Do not parse CAD/PDF files on the server unless the parser is trusted and sandboxed.

## Cloudflare Edge Security

- Use Cloudflare Pro at launch.
- Enable managed WAF rules.
- Enable DDoS protection and bot protection appropriate to the plan.
- Force HTTPS and use `Full (strict)` SSL once origin certificates are correct.
- Enable DNSSEC after DNS is stable.
- Add rate limits and challenges for:
  - Admin routes.
  - Login.
  - Password reset.
  - Product write APIs.
  - Import APIs.
  - Upload APIs.
  - Contact and quote forms.
  - Catalogue/download lead forms.
  - Search endpoints.
- Monitor WAF events, traffic spikes, origin errors, and admin/API attack patterns.

## Security Headers

Configure:

- `Content-Security-Policy`.
- `Strict-Transport-Security` after HTTPS is stable.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `frame-ancestors 'none'` or equivalent frame protection.
- `Permissions-Policy` disabling unused browser features.

CSP must explicitly allow only the required app, Supabase, Cloudflare, image, font, analytics, and 3D asset origins.

## Secrets And Environments

- Production Supabase projects should live under a Luminac/client-owned Supabase organization.
- Developer-owned Supabase organizations are acceptable for prototypes only, not final production ownership.
- If development starts under a developer organization, transfer the project to the client organization before production launch.
- Keep at least one named Luminac owner on the organization.
- Remove developer access after handoff or when it is no longer needed.
- Store secrets only in the deployment platform secret manager or a password manager.
- Never commit `.env` files with real secrets.
- Never expose Supabase service-role keys to browser bundles.
- Use separate credentials for:
  - Production runtime.
  - Staging runtime.
  - Preview deployments.
  - Migrations.
  - Backups.
  - Read-only analytics.
- Production database credentials must not be usable from local previews unless explicitly approved.
- Rotate old registrar, hosting, CMS, FTP/SFTP, SSH, database, SMTP, analytics, CDN, and deployment credentials.

## Dependency And Code Quality Gates

- Use TypeScript strict mode for application code.
- Keep lockfiles committed and reviewed.
- Pin and review packages used for auth, uploads, admin, 3D rendering, sanitization, and database access.
- Run dependency vulnerability scans before launch.
- Run secret scans before launch.
- Keep lint, typecheck, and build passing before deployment.
- Keep security-sensitive utilities small, tested, and server-only where possible.
- Avoid custom crypto, custom password handling, custom auth protocol logic, and ad hoc SQL string construction.

## Logging And Audit

Audit log events:

- Login and failed login.
- MFA setup/change/removal.
- Password reset.
- Role changes.
- Product create/update/delete/restore.
- Import start/finish/failure.
- Media upload/publish/unpublish/delete.
- CAD/private asset access policy changes.
- Backup, restore, and destructive maintenance actions.

Log rules:

- Logs must include actor, action, target, timestamp, result, and request context where safe.
- Do not log secrets, session tokens, raw passwords, private keys, or full sensitive payloads.
- Keep enough server-side detail to investigate attacks without exposing details to users.

## Backups And Anti-Wipe Controls

- Use Supabase automated database backups.
- Enable point-in-time recovery if budget allows.
- Keep daily logical exports in a separate storage account or bucket.
- Enable object storage versioning or independent asset copies where supported.
- Runtime app credentials must not be able to delete backups.
- No hard delete for products/assets from normal admin UI.
- Dangerous maintenance scripts require explicit confirmation and a fresh backup.
- Run a restore drill before launch.

Restore drill must verify:

- Product page renders.
- Images load.
- Datasheet loads.
- CAD file is available with safe download headers.
- Tags, specs, variants, and SEO metadata are restored.
- Public catalogue can be recovered within 4 business hours.

## SEO And Old Hack Cleanup

- Use Google Search Console for hacked URL discovery and recrawl.
- Return `410 Gone` for confirmed spam URLs that never belonged to Luminac.
- Return `404` when unsure.
- Do not redirect spam URLs to the homepage.
- Publish a clean sitemap after launch.
- Do not import old WordPress users, sessions, plugin settings, unknown post meta, or executable upload folders.

## Verification Before Launch

Required checks:

- Public users cannot access admin pages, draft products, private CAD files, upload endpoints, or write APIs.
- Roles can only perform intended actions.
- Direct API calls without frontend controls are blocked.
- RLS policies are tested with anon, authenticated, and admin contexts.
- CSRF protection blocks forged cookie-authenticated mutations.
- Invalid uploads are rejected: renamed PHP, scripted SVG, fake MIME, oversized files, archives, path traversal names.
- Security headers pass a modern scan.
- CSP does not break required app, image, font, analytics, Supabase, Cloudflare, or 3D asset origins.
- Cloudflare WAF/rate-limit rules are active.
- Dependency scan passes or risks are accepted in writing.
- Secret scan passes.
- Restore drill passes.
