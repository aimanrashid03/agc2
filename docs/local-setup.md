# Local Setup — AGC2

> **On-prem note:** locally the **entire on-prem stack** runs — Postgres + pgvector, Ollama (`bge-m3` + `qwen2.5`), and **Auth.js v5**. The **deployed** Vercel app may still use hosted Supabase (Auth + a few page reads) until the VM cutover. Full detail + VM handoff: [on-prem-migration.md](on-prem-migration.md).

## Quick-start (on-prem, local)
Prereqs: **Docker**; **Ollama** with `bge-m3` + `qwen2.5:7b-instruct` pulled (`ollama pull bge-m3 && ollama pull qwen2.5:7b-instruct`); the client **VPN** up (to reach MySQL); and a `.env.local` (copy [.env.example](../.env.example)) with `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres`, `MYSQL_*`, `OLLAMA_URL`, `CHAT_*`/`OPENROUTER_API_KEY`, and **Auth.js** `AUTH_SECRET` + `AUTH_URL=http://localhost:3001` + `AUTH_TRUST_HOST=true`.

```bash
npm install                          # .npmrc sets legacy-peer-deps=true
docker compose up -d                 # local pgvector container (127.0.0.1:5432)
npx tsx scripts/setup-db.ts          # schema: vector(1024) + roles + match_documents
npx tsx scripts/setup-auth.ts --seed admin@agc.local agc12345 "Admin" admin   # users table + an admin login
npx tsx scripts/sync-mysql.ts        # MySQL ilims_usr -> Postgres (clean/categorize/upsert)
npx tsx scripts/ingest-data.ts --sample 800   # bge-m3 embeddings (subset; full ~10h on CPU)
npx tsx scripts/test-retrieval.ts && npx tsx scripts/test-chat-v2.ts   # verify RAG
npm run dev                          # http://localhost:3001
```

## Prerequisites
- Node 20+, npm.
- Docker (the local `pgvector/pgvector:pg16` container in `docker-compose.yml`, `127.0.0.1:5432`).
- Ollama serving `bge-m3` (embeddings) and `qwen2.5:7b-instruct` (chat); local dev may instead use OpenRouter for chat via `CHAT_BASE_URL`/`OPENROUTER_API_KEY`.
- Client VPN to reach the source MySQL for `sync-mysql.ts`.

## Environment (`.env.local`)
Copy [.env.example](../.env.example) to `.env.local` and fill it in — it documents the current **on-prem** contract (`DATABASE_URL`, `AUTH_SECRET`/`AUTH_URL`/`AUTH_TRUST_HOST`, `OLLAMA_URL`/`EMBED_MODEL`, `CHAT_*`, `REFUSE_GATE`, `MYSQL_*`). The `pg` pool falls back to `127.0.0.1:5432` when `DATABASE_URL` is unset; `next build` works without an LLM key (the chat client has a dummy-key fallback; the runtime guard throws instead).

> Legacy cloud only (no longer in `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` — these powered the retired Supabase + OpenAI path and may still apply to the deployed cloud branch.

## Commands
```bash
npm run dev      # Next dev server on port 3001 (not 3000)
npm run build    # next build — the quality gate; must pass with zero errors
npm run start    # serve production build
npm run lint     # ESLint
```

## Database & data
Stage order is **setup-db → sync → ingest** (embeddings reference `case_id`). See [docs/data-pipeline.md](data-pipeline.md) for the full pipeline and script inventory.

- `setup-db.ts` is idempotent and **destructive** (drops/recreates the schema) — confirm `DATABASE_URL` points at the intended DB first.
- `sync-mysql.ts` upserts on `source_id`; `ingest-data.ts` is incremental (skips unchanged cases via `content_hash`), so re-running after a partial failure is safe.
- To add or refresh cases later, just re-run `sync-mysql.ts` then `ingest-data.ts`. (The old folder-scoped `seed-data.ts` JSON path is archived — [docs/archive/legacy-pipeline/](archive/legacy-pipeline/).)

## Smoke checks
```bash
npx tsx scripts/count-cases.ts         # case counts per source_folder
npx tsx scripts/check-embeddings.ts    # embedded chunk counts
npx tsx scripts/test-pages-data.ts     # page data access via src/lib/cases.ts
npx tsx scripts/test-retrieval.ts      # vector search + refusal gate
npx tsx scripts/test-chat-v2.ts        # end-to-end chat (qwen via Ollama/OpenRouter)
npx tsx scripts/test-auth.ts           # Auth.js credential login logic
```

## Auth note
All pages except `/auth/*` require a logged-in user (Auth.js v5). Create the first login with `npx tsx scripts/setup-auth.ts --seed <email> <password> "<name>"` (add `admin` to make it an admin, or promote later with `--promote <email>`); self-service sign-up at `/auth/sign-up` is also enabled in local dev. Admin-only pages/routes (`/admin/*`) require `role === 'admin'`.

## Pointing at a different Postgres (e.g. a new VM or hosted DB)
1. Put the new connection string in `DATABASE_URL` (`.env.local`, and the Vercel env for the cloud branch). Use a **session** connection (port 5432) so `CREATE EXTENSION` / DDL work.
2. Ensure `pgvector` is available — `setup-db.ts` runs `CREATE EXTENSION IF NOT EXISTS vector` (on managed Postgres you may need to enable it in the provider's dashboard first).
3. ⚠️ Confirm `DATABASE_URL` points at the **new, empty** DB, then `npx tsx scripts/setup-db.ts` — it `DROP TABLE`s first.
4. Verify with `npx tsx scripts/verify_new_schema.ts`, then run the data flow (sync → ingest) and the smoke checks above.
5. The `users` table does **not** carry over — recreate a login with `setup-auth.ts`.

## Deployment
The deployed app currently runs on Vercel (`CloudDeploy` branch). The **target** is the client's self-hosted Ubuntu VM (Postgres + pgvector + Ollama, CPU-only); environment-specific details, VM specs, and the cutover checklist are in [on-prem-migration.md](on-prem-migration.md).
