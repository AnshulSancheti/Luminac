# Luminac-Website
This is the website of Luminac Lighting, my first freelance project

## Planning Documents

- [Catalogue Website Brief V2](docs/design-research/luminac-catalogue-website-brief-v2.md) - page map, homepage story, catalogue/search/filter UX, product-page format, and Supabase content mapping.
- [Lighting Website Benchmark](docs/design-research/lighting-website-benchmark-2026-07.md) - broader global and Indian architectural-lighting website research with local captures.
- [Website Design Brief](docs/design-research/luminac-website-design-brief.md) - text-first design direction for the public Luminac website before visual mockups or coding.
- [And Tea Design Analysis](docs/design-research/andtea-com-analysis.md) - reference analysis for restrained premium product storytelling patterns.

## Deployment

The production site runs on the `luminac-website` Cloudflare Worker at
`https://luminac.net`. Pull requests validate the Cloudflare build, and pushes
to `main` deploy through `.github/workflows/luminac-website.yml`.

Repository configuration:

- GitHub Actions variable: `CLOUDFLARE_ACCOUNT_ID`
- GitHub Actions secret: `CLOUDFLARE_API_TOKEN`
- Cloudflare token scope: use the **Edit Cloudflare Workers** template and
  restrict it to the Luminac Cloudflare account and `luminac.net` zone.

Local verification and deployment:

```bash
npm ci
npm run cf:typegen
npm run typecheck
npm run lint
npm run cf:build
npm run deploy
```
