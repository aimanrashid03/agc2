---
name: data-pipeline
description: Use when working on data cleaning, seeding, or embedding ingestion — anything under scripts/ (clean_legal_data.py, seed-data.ts, ingest-data.ts, setup-db.ts) or the data/cleaned JSON files.
---

# Data Pipeline Work — AGC2

> **⚠️ Migration LANDED for local dev (2026-06-22).** Current path is **`sync-mysql.ts` → `ingest-data.ts`**: read client MySQL `ilims_usr` directly → clean/triage/categorize → upsert on `source_id` → incremental `bge-m3` embed (skip unchanged via `content_hash`). The `clean → seed → ingest` JSON path below is **LEGACY/unused** (kept). Still TODO: schedule the sync (cron/systemd) on the VM + source-side change detection.

## Before writing any code (mandatory pre-flight)
1. Read [docs/data-pipeline.md](../../../docs/data-pipeline.md) — stages, script inventory, ordering rules.
2. Read the script you're changing in full; check whether a sibling script depends on its output shape (clean → seed → ingest are coupled by file/format contracts).
3. If touching schema, also read [docs/database.md](../../../docs/database.md) and apply the `database` skill.

## Pipeline contract (do not break)
- Stage order is **setup-db → clean → seed → ingest**. Embeddings reference `case_id`; re-seeding invalidates `case_embeddings` (clear before re-ingesting).
- Cleaned output shape: `data/cleaned/<category>/clean_info.json` + `clean_people.json` + `clean_allegation.json` — seed-data.ts expects exactly these names per category folder.
- Chunking: `RecursiveCharacterTextSplitter`, **chunkSize 1000 / chunkOverlap 200**; each chunk begins with a `Case Name: ...` line that the chat route parses for citations. Changing the header format breaks chat citations until re-ingest + route update.
- Embedding model Ollama `bge-m3` (1024d) must match the `vector(1024)` column and the chat route. (Legacy path used `text-embedding-3-small`/1536.)

## Hard rules
- TS scripts run via `npx tsx scripts/<name>.ts` and read `.env.local` (dotenv) — they need `DATABASE_URL`; `sync-mysql.ts` needs `MYSQL_*` (+ VPN); `ingest-data.ts` needs `OLLAMA_URL` (bge-m3). (Legacy ingest used `OPENAI_API_KEY`.)
- Ingestion costs real OpenAI money and is resumable — prefer `ingest-data-continue.ts` after partial failures instead of re-running from scratch.
- Never point a seeding/ingest run at production unless the user explicitly asked; state which `DATABASE_URL` the run will hit before running.
- `clean_legal_data.py` is plain Python stdlib — keep it dependency-free.
- New scripts: add a row to the inventory table in docs/data-pipeline.md.

## After the change (mandatory verification)
1. Run the changed script against a small subset or local DB first; paste the actual output.
2. Verify counts: `npx tsx scripts/count-cases.ts` and `scripts/check-embeddings.ts`.
3. If chunk format or embeddings changed: `npx tsx scripts/test-retrieval.ts` must still return sensible matches, and a chat smoke test must still render citations.
4. `npm run build` if any shared types under `src/` were touched.

## Common mistakes
- Re-seeding without clearing `case_embeddings` → orphaned/stale chunks pollute RAG answers.
- Editing the chunk header format and forgetting the chat route's `Case Name:` parser.
- Running ingest with the wrong `DATABASE_URL` (local vs Supabase pooler) → embeddings land in the wrong DB.
- Assuming seed-data batches inserts — it inserts row-by-row; large datasets are slow, don't add timeouts that kill it mid-run.
