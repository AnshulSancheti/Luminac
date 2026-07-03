# Incident Recovery And SEO Cleanup Plan

Date: 2026-05-27  
Project: `luminac.net`

## Assumption

Treat the old Luminac site as compromised until proven clean.

The old site reportedly had poker and NSFW spam links, and the database was wiped. Public traces suggested WordPress/WooCommerce-style paths. That means old code, uploads, users, plugin settings, database state, and credentials are not safe inputs for the new website.

## Do Not Reuse

- Old WordPress install.
- Old cPanel/server image.
- Old plugin or theme code.
- Old upload directories.
- Old database dump as the source of truth.
- Old CMS users or password hashes.
- Old sessions, API keys, OAuth apps, cron jobs, or deploy hooks.
- Old FTP/SFTP/SSH/database/SMTP credentials.

## What Can Be Moved

Only verified business content should move:

- Product names.
- Product specs.
- Product categories and tags.
- Product images after validation.
- CAD files after validation.
- Datasheets after validation.
- Project/reference copy after review.

## SEO Spam Cleanup

1. Get Google Search Console access for `luminac.net`.
2. Export indexed URLs, crawl errors, search queries, and manual/security issue reports.
3. Collect old sitemap history and server logs if available.
4. Identify spam URLs containing terms such as poker, casino, betting, adult, NSFW, pharma, pills, payday, hidden links, or suspicious redirects.
5. Return `410 Gone` for confirmed malicious URLs that never belonged to Luminac.
6. Return `404` for uncertain URLs.
7. Do not redirect spam URLs to the homepage.
8. Publish clean sitemap after launch.
9. Request recrawl after launch.

## Credential Rotation

Rotate or replace:

- Registrar credentials.
- Hosting credentials.
- CMS/admin credentials.
- FTP/SFTP/SSH credentials.
- Database credentials.
- SMTP/email service credentials.
- Analytics access.
- CDN/DNS access.
- Deployment secrets.
- Object storage keys.

## Launch Blockers

- Unknown old DNS records still active.
- Old hosting still serving public spam.
- New app using old database or old uploads directly.
- No Google Search Console access.
- No backup/restore plan.
- Admin area public without MFA/rate limiting.
- Uploads accepted without validation.

