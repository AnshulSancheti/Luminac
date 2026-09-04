# Luminac Product Platform

Repository for Luminac product data, Supabase schema, import tooling, and deployment configuration.

## Current Infrastructure

- Supabase project: `https://rusmnrgfbxffskyqiygc.supabase.co`
- Cloudflare CLI: configured through Wrangler
- Cloudflare MCP servers: registered in Codex

## Intended Repo Contents

- `supabase/migrations/` - database schema migrations
- `src/types/` - generated Supabase TypeScript types
- `docs/` - implementation notes and data-model decisions
- `.env.example` - required environment variable names without secrets

## Local Setup

Install global CLIs once per machine:

```bash
npm install -g supabase wrangler
gh auth login -h github.com
supabase login
wrangler login
```

Link this repo to the existing Supabase project:

```bash
supabase link --project-ref rusmnrgfbxffskyqiygc
```

Generate Supabase types after the schema is in place:

```bash
supabase gen types typescript --linked > src/types/supabase.ts
```

