# Cloudflare D1 and R2 staging stack

The Luminac catalogue now has a live, read-only public Cloudflare staging runtime:

```text
https://luminac-catalog-staging.shivam-a7d.workers.dev
```

The isolated administrative staging Worker is also deployed at:

```text
https://luminac-admin-staging.shivam-a7d.workers.dev
```

The admin Worker is protected by Cloudflare Access. Every unauthenticated live route redirects to the `luminac.cloudflareaccess.com` login; only `shivam@luminac.net` is allowlisted, and MFA is required. Its local Access simulation has passed against the 135-product authoritative D1 copy. On 2026-08-19, the allowed user completed a real Cloudflare-account login with MFA, verified the deployed dashboard and R2 images, and completed a reversible authenticated D1 write canary. The secure D1 write implementation remains disabled outside deliberate canary windows.

This is staging infrastructure, not the final production cutover. Supabase remains intact for rollback until the remaining frontend, parity, and cutover gates pass.

## Isolation model

- `luminac-product-qa-db` is the authoritative staging D1. It contains all 20 application tables and is not bound to the public Worker.
- `luminac-public-catalog-staging` is an allowlisted 14-table D1 projection. It contains only published catalogue fields.
- `luminac-product-images-qa` contains the active content-versioned product, application, and line-drawing WebP derivatives and is the only R2 bucket bound to the public Worker. Legacy product-image keys remain temporarily for rollback but are no longer referenced by D1.
- `luminac-private-assets-staging`, `luminac-upload-quarantine-staging`, and `luminac-backups-staging` are private and have no runtime bindings.
- All four R2 buckets have `r2.dev` disabled. No browser-direct upload or bucket listing is enabled.
- The public Worker has no secrets, write routes, authoritative D1 binding, private bucket binding, or permissive CORS policy.
- The administrative Worker is bound only to the authoritative staging D1, published-image R2, and its static assets. It has no Supabase secrets or private, quarantine, or backup R2 binding.
- Static assets use `run_worker_first: true`, so HTML and JavaScript cannot bypass the server-side Access gate.
- Cloudflare Access is attached directly to the administrative Worker using its immutable Worker ID, so protection applies to its `workers.dev` address and any future routes unless a more specific Access destination overrides it.
- The Access application uses the Cloudflare account identity provider restricted to members of this Cloudflare account, an exact-email allow rule, eight-hour sessions, MFA, `HttpOnly` cookies, `SameSite=Lax`, and binding cookies. `Lax` is required for the cross-site authorization callback; Cloudflare documents that `Strict` can cause an `ERR_TOO_MANY_REDIRECTS` loop. Eager multi-host cookie redirects are disabled because this application has only one browser hostname. Unmatched users are denied by default.
- Because Cloudflare's Static Assets router does not pass `ctx.access` into the user Worker, the Worker verifies the signed `Cf-Access-Jwt-Assertion` with Cloudflare's remote JWKS. It fails closed unless the signature, issuer, expiry, application audience, and exact `shivam@luminac.net` email all pass. Local Wrangler development continues to use the simulated `ctx.access` identity.
- Administrative writes require the server-derived Access email, a session-bound CSRF token, exact same-origin JSON requests, explicit confirmation, a quoted `If-Match` product version, bounded allowlisted fields, parameterized D1 statements, and an atomic append-only audit entry. Browser-supplied actor identities are ignored.
- Product aggregate writes use optimistic concurrency through `products.version`; stale writes fail with `409`. The D1 batch guards every product, detail, specification, extra-field, and audit statement with the expected version before incrementing it.
- Email one-time PIN remains configured only as an unused rollback provider; it is not in the admin application's `allowed_idps` list and cannot be selected for this application.
- A private Access App Launcher is enabled at `https://luminac.cloudflareaccess.com` for the same exact email, Cloudflare account identity provider, MFA requirement, and eight-hour session. It exposes only the Luminac administrative staging application and prevents the post-MFA `#/NoAuth` dead end.
- Account-wide unmatched-request denial remains disabled so the separate public catalogue Worker stays public.

## Public routes

```text
GET|HEAD /api/health
GET|HEAD /api/categories
GET|HEAD /api/products?q=&environment=&category=&page=&pageSize=
GET|HEAD /api/products/:slug
GET|HEAD /assets/products/:model/:role/:versioned-file.webp
```

The active roles are `product`, `application`, and `line-drawing`. Legacy one-level product keys remain accepted during the rollback window. Every other method is rejected. Query keys, lengths, enum values, page bounds, slugs, and asset keys are validated. D1 statements are parameterized and select explicit columns.

## Verified staging state

- Authoritative D1: all 20 table digests match the generated migration manifest; zero foreign-key violations.
- Public D1: 21 categories, 108 families, 135 products, 674 specifications, 30 public extra fields, 493 active asset records, and 493 product-asset links; zero foreign-key violations.
- Active public asset coverage: 153 product images across all 135 products, 232 application images across 132 products, and 108 line drawings across 96 products.
- Public R2 rollout: all 493 active objects (34,951,268 bytes) were uploaded, downloaded again, and SHA-256 verified.
- The asset query plan uses indexed searches on both `product_assets` and `asset_files`; the redundant duplicate relationship index was removed and `PRAGMA optimize` runs after migration/import work.
- Pre-asset-v2 backups are stored privately under `d1/2026-08-19/pre-asset-v2/` in `luminac-backups-staging` with a `SHA256SUMS.txt` manifest.
- Restore drill: the authoritative SQL backup was restored into a clean APAC D1, every table digest passed, and the disposable drill database was then deleted.
- Pre-write migration backup: `backups/d1/2026-08-19/pre-admin-write-safety.sql` is stored in private backup R2 and was downloaded and SHA-256 verified (`ee4238fd471412e72de376f15723ec54a06e9b4fa82ca0af860f668d13fb4bfc`).
- Admin write safety migration: all 135 remote products have version `1`, and D1 rejects updates or deletes against `audit_logs` through append-only triggers.
- Catalogue refreshes preserve append-only D1 audit history while verifying every Supabase-sourced audit row; the current remote copy contains 80 source rows and 6 preserved D1-only entries.
- Local reversible write canary: CSRF and foreign-origin rejection, signed audit identity, atomic product/audit writes, stale-version rejection, and restoration of the original record all passed.
- Live smoke test: D1 list/detail reads, R2 image reads, ETag `304`, security headers, strict `405`, input bounds, and traversal rejection passed.

## Local and staging verification

```bash
npm run cf:migration:check
npm run cf:public:check
npm run cf:assets:build
npm run cf:r2:check
npm run cf:types
npm run cf:public:types
npm run cf:typecheck
npm run cf:dry-run
npm run cf:public:dry-run
npm run cf:admin:smoke
npm run cf:admin:writes:test-local -- http://127.0.0.1:8788
npm run cf:public:smoke
```

Generated SQL, manifests, and backup exports live under `cloudflare/generated/`. They are gitignored and written with owner-only permissions.

Remote mutations are deliberately separate commands:

```bash
npm run cf:migrate:remote
npm run cf:import:remote
npm run cf:verify:remote
npm run cf:public:migrate:remote
npm run cf:public:import:remote
npm run cf:public:verify:remote
```

`cf:r2:upload` also writes remotely and must not be folded into a routine local check.

## Remaining production gates

1. Review or source application images for the 3 uncovered products and line drawings for the 39 uncovered products; AI and ambiguous application candidates remain excluded from automatic publication.
2. Add the form-ingestion Worker with Turnstile, rate limits, narrow validation, and isolated bindings when forms enter scope.
3. Connect the Next.js catalogue pages to the public Worker and validate product/application/line-drawing rendering, cache, and error behavior.
4. Add the final custom domain, WAF/rate-limit rules, monitoring alerts, and production-only HSTS after every hostname is healthy.
5. Freeze Supabase writes, take a final export, rerun parity, canary the cutover, and keep Supabase read-only through the rollback window.
6. Revoke and remove Supabase credentials only after the admin runtime and every deployed application have passed without Supabase.
