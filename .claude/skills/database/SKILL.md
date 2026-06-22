---
name: database
description: Use when changing the database schema, match_documents(), RLS/grants, connection handling (src/lib/db.ts), or choosing between the pg pool and supabase-js clients.
---

# Database Work — AGC2

> **⚠️ Migration LANDED for local dev (2026-06-22).** Local dev runs a `pgvector` container (`docker-compose.yml`, `127.0.0.1:5432`); `setup-db.ts` now creates **`vector(1024)`** (bge-m3), bootstraps the `anon/authenticated/service_role` roles, and adds `cases.content_hash` + `act_tags`. **The `vector(1536)` note below is SUPERSEDED.** Supabase fully removed — auth is **Auth.js v5** (`users` table), page reads are `pg` via `src/lib/cases.ts`.

## Before writing any code (mandatory pre-flight)
1. Read [docs/database.md](../../../docs/database.md) — tables, relationships, `match_documents` signature, client-per-context table.
2. Read `scripts/setup-db.ts` in full — it is the single source of truth for schema (there is no migrations folder).
3. Grep for every consumer of what you're changing: column names appear in pages, API routes, PDF extraction helpers, and scripts.

## Hard rules
- Schema changes go in `scripts/setup-db.ts` and must stay **idempotent** (drop-if-exists before create) — the script is the rebuild path.
- `match_documents(query_embedding text, match_threshold float, match_count int, match_filter jsonb)` — if you change the signature, also: drop old overloads in setup-db (the script already drops three historical ones — follow that pattern), update the chat route's call, and re-grant `EXECUTE` to `anon, authenticated, service_role`.
- The embedding column is `vector(1024)` — coupled to Ollama `bge-m3` in both ingest and chat. Dimension changes require full re-ingestion + gate retune. (Was `vector(1536)`/`text-embedding-3-small`.)
- All DB access is the `pg` pool (`src/lib/db.ts`): API routes/scripts directly; server components via `src/lib/cases.ts`. Never import `pg` into a client component. (Supabase clients removed.)
- Keep the dev-mode `global` pool cache in `src/lib/db.ts` — removing it leaks connections on every hot reload.
- `cases.status` has two effective values (`SELESAI` / `BELUM SELESAI`) hardcoded in the table filter and interpreted by the dashboard — adding a status value means updating both.
- Destructive operations (DROP/TRUNCATE/DELETE without WHERE) against a non-local `DATABASE_URL`: stop and confirm with the user first.

## After the change (mandatory verification)
1. Run `npx tsx scripts/setup-db.ts` against a local/dev DB and paste the output.
2. `npx tsx scripts/verify_connection.ts` and (if the function changed) `scripts/verify-function.ts` / `scripts/test-retrieval.ts`.
3. Grep the renamed/removed column across `src/` and `scripts/` — zero remaining references to the old name.
4. `npm run build` — zero errors (types in `src/types/index.ts` mirror the schema; update them together).

## Common mistakes
- Editing the schema by hand in Supabase Studio without updating `setup-db.ts` → next rebuild silently reverts it.
- Changing `match_documents` and forgetting the GRANT → works locally as postgres, 403s for app roles.
- Renaming a `cases` column without updating `src/types/index.ts` and the PDF extraction helpers.
