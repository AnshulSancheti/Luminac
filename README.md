# Luminac

Project workspace for the Luminac website, product data platform, catalogues, infrastructure planning, and implementation notes.

## Structure

- `Luminac-Website/` - website project files and related notes
- `Luminac-Product-Platform/` - Supabase/product data platform scaffold
- `Catalogues/` - catalogue and product source data
- `website-plan/` - architecture, security, storage, and implementation planning
- `sessions/` - project decision records and setup notes
- `Competitive analysis/` - reference screenshots and competitor research

## Infrastructure

- Supabase project URL: `https://rusmnrgfbxffskyqiygc.supabase.co`
- Supabase project ref: `rusmnrgfbxffskyqiygc`
- Cloudflare access: configured through Wrangler and Codex MCP
- Git branch: `main`

## Supabase

This repo is linked to the Supabase project with the CLI. Local runtime state is ignored under `supabase/.temp/`.

Generate database types after schema changes:

```bash
supabase gen types typescript --linked > Luminac-Product-Platform/src/types/supabase.ts
```

## Secrets

Do not commit real secrets. Use local `.env` files and deployment secret stores. Commit only `.env.example` files.
