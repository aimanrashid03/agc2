# Local Setup — AGC2

> **On-prem note:** the cloud setup below (Supabase + OpenAI) still powers **Auth and the deployed app**. The **data + RAG** path now runs the on-prem stack locally (see the quick-start just below). Full detail + VM handoff: [on-prem-migration.md](on-prem-migration.md).

## On-prem local quick-start (data + RAG)
Prereqs: Docker, Ollama with `bge-m3` + `qwen2.5:7b-instruct` pulled, VPN up (to reach MySQL), and `.env.local` with `MYSQL_*`, `OPENROUTER_API_KEY`, `OLLAMA_URL`, `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres`, and **Auth.js** `AUTH_SECRET` + `AUTH_URL=http://localhost:3001` + `AUTH_TRUST_HOST=true`. (No `NEXT_PUBLIC_SUPABASE_*` — Supabase removed.) Create the auth user store + a dev login: `npx tsx scripts/setup-auth.ts --seed admin@agc.local agc12345 "Admin"`.
```bash
docker compose up -d                 # local pgvector container (127.0.0.1:5432)
npx tsx scripts/setup-db.ts          # schema: vector(1024) + roles + match_documents
npx tsx scripts/sync-mysql.ts        # MySQL ilims_usr -> Postgres (clean/categorize/upsert)
npx tsx scripts/ingest-data.ts --sample 800   # bge-m3 embeddings (subset; full ~10h on CPU)
npx tsx scripts/test-retrieval.ts && npx tsx scripts/test-chat-v2.ts   # verify
```
The cloud first-time flow below is the **legacy** Supabase path.

## Prerequisites
- Node 20+, npm. Python 3 only if running the data-cleaning stage.
- A Supabase project (hosted) — or local Supabase via docker (the `pg` pool falls back to `127.0.0.1:54322`).

## Environment (`.env.local`)
Copy [.env.example](../.env.example) to `.env.local` and fill in:
```
NEXT_PUBLIC_SUPABASE_URL=        # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # Supabase anon key
SUPABASE_SERVICE_ROLE_KEY=       # server-only; used by verify-function.ts
DATABASE_URL=                    # Postgres connection string (Supabase SESSION pooler :5432, or local)
OPENAI_API_KEY=                  # embeddings + gpt-4o chat
```
The two `NEXT_PUBLIC_*` vars are consumed with non-null assertions — the app crashes at runtime (not build) without them. `next build` works without `OPENAI_API_KEY` (dummy-key fallback in the chat route).

## Commands
```bash
npm run dev      # Next dev server on port 3001 (not 3000)
npm run build    # next build — the quality gate; must pass with zero errors
npm run start    # serve production build
npm run lint     # ESLint
```

## First-time database
```bash
npx tsx scripts/setup-db.ts        # create schema + match_documents()
npx tsx scripts/seed-data.ts       # load data/cleaned/** into cases/people/allegations
npx tsx scripts/ingest-data.ts     # chunk + embed into case_embeddings (needs OPENAI_API_KEY; costs money)
```
Order matters: setup → seed → ingest. See [docs/data-pipeline.md](data-pipeline.md).

## Moving to a new Supabase project (different account/env)
1. Create the new project; collect URL, anon key, service role key, and the **Session pooler** connection string (port 5432 — DDL/`CREATE EXTENSION` need a session connection, not the transaction pooler on 6543).
2. Enable `pgvector` — `setup-db.ts` runs `CREATE EXTENSION IF NOT EXISTS vector`; if the pooled role can't, enable it via **Dashboard → Database → Extensions → `vector`** first.
3. Put the new values in `.env.local` (and the Vercel project env).
4. ⚠️ Confirm `DATABASE_URL` points at the **new, empty** project, then `npx tsx scripts/setup-db.ts` — it `DROP TABLE`s first.
5. Verify: `verify_new_schema.ts`, `verify_connection.ts`. Then full seed + ingest (see above), and check counts.
6. `auth.users` does **not** carry over — recreate the login user via `/auth/sign-up`.

To add more cases later (one new act at a time), use the folder-scoped flow in [docs/data-pipeline.md](data-pipeline.md#incremental-case-adds-one-new-act--one-new-folder).

## Smoke checks
```bash
npx tsx scripts/verify_connection.ts   # DB reachable
npx tsx scripts/count-cases.ts         # seeded rows
npx tsx scripts/test-retrieval.ts      # vector search works
```

## Auth note
All pages except `/auth/*` require a logged-in Supabase user — create one via `/auth/sign-up` on first run.

## Deployment
Vercel. Set all five env vars in the Vercel project; `transpilePackages: ['@supabase/ssr']` in `next.config.ts` must stay.
