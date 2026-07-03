# Domain And Edge Security Plan

Date: 2026-05-27  
Domain: `luminac.net`

## Decision

Use Cloudflare as the domain edge for `luminac.net`: DNS, CDN, SSL, WAF, DDoS protection, DNSSEC, rate limiting, and security monitoring.

After DNS is stable, transfer the domain registrar from GoDaddy to Cloudflare Registrar.

## Why

The old Luminac site was compromised and showed spam content. The new site needs a stronger front door before requests reach the app. Cloudflare gives the best return for this project because the security and performance features needed for launch are included or available at low cost, while GoDaddy's upsells duplicate things Cloudflare should handle.

## What To Keep At GoDaddy Temporarily

- Account MFA.
- Unique password stored in a password manager.
- Domain lock or transfer lock.
- Auto-renew with valid payment method.
- Accurate registrant/admin contact email.
- Domain privacy if available.

## What Not To Buy At GoDaddy

- Paid SSL certificate.
- Premium DNS.
- Website Security / WAF bundle for the clean rebuild.
- Malware cleanup subscription for the new site.

Exception: emergency cleanup or temporary containment may be considered only if the old compromised site must stay online during migration.

## Cloudflare Setup

1. Create or use a Cloudflare account controlled by the named Luminac owner.
2. Enable MFA on the Cloudflare account.
3. Add `luminac.net` as a Cloudflare zone.
4. Export existing GoDaddy DNS records before changing anything.
5. Recreate only required records in Cloudflare:
   - Apex/root web record.
   - `www`.
   - Email MX records.
   - SPF, DKIM, and DMARC TXT records.
   - Provider verification TXT records that are still needed.
6. Remove old hosting, parked, unknown, wildcard, and forgotten records.
7. Change GoDaddy nameservers to Cloudflare.
8. Wait for Cloudflare zone status to become active.
9. Enable Cloudflare proxy for web traffic.
10. Set SSL mode to `Full (strict)` after origin SSL is correct.
11. Force HTTPS.
12. Enable WAF managed rules.
13. Add rate limits and challenges for sensitive paths.
14. Enable DNSSEC after DNS has stabilized.
15. Add HSTS only after every required subdomain is HTTPS-safe.
16. Transfer registrar to Cloudflare after 1-2 stable weeks.

## WAF And Rate-Limit Targets

- `/admin/*`
- Login and password reset endpoints.
- Product create/update/delete APIs.
- Import APIs.
- Upload APIs.
- Contact form.
- Quote form.
- Catalogue/download lead form.
- Search endpoints that can be expensive or abused.

## Hostname Separation

Final hostnames are still open, but the plan should separate:

- Production website.
- Admin dashboard.
- Staging environment.
- Preview deployments.
- Asset/CDN delivery.

Preview and staging must not be indexable and must not share production secrets.

## Launch Checks

- Cloudflare account MFA enabled.
- GoDaddy lock and auto-renew enabled until registrar transfer.
- DNS records reviewed and old records removed.
- Email records preserved and tested.
- HTTPS redirect works.
- SSL mode is not insecure.
- WAF and rate limits enabled.
- DNSSEC enabled after stability window.
- Security headers configured.
- WAF events monitored after launch.

