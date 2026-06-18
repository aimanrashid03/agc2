# Data Pipeline — AGC2

Three-stage pipeline: **clean → seed → ingest**. Source data is Malaysian criminal case records (LKK — Laporan Kes Kehakiman).

## Stages
1. **Clean** — `scripts/clean_legal_data.py` (Python; venv-free, stdlib): normalizes raw legal exports into `data/cleaned/<category>/clean_info.json`, `clean_people.json`, `clean_allegation.json`.
2. **Seed** — `scripts/seed-data.ts` (run with `npx tsx`): loads the cleaned JSON into `cases`, `people`, `allegations`. Inserts linked rows one-by-one (no batch inserts — slow but simple).
3. **Ingest** — `scripts/ingest-data.ts`: chunks case text with LangChain `RecursiveCharacterTextSplitter` (**chunkSize 1000, chunkOverlap 200**), embeds each chunk with OpenAI `text-embedding-3-small`, writes to `case_embeddings`. `scripts/ingest-data-continue.ts` resumes a partial run.

Each chunk's content starts with a `Case Name: ...` line — the chat route parses this to build citations. Don't change the chunk header format without updating `src/app/api/chat/route.ts`.

## Data categories (source folders)
- AKTA KANUN KESEKSAAN (Penal Code)
- AKTA PENCULIKAN 1961 (Kidnapping Act)
- Seksyen 39B (Drug trafficking — the cases-table "Kes Dadah" filter matches `source_folder` containing `39B` or akta containing `DADAH`/`BERBAHAYA`)
- TPR Chan Lee Lee
- Lain-lain (Others)

## Script inventory (`scripts/`)
| Script | Purpose |
|---|---|
| `setup-db.ts` | Create/recreate schema + `match_documents` |
| `clean_legal_data.py` | Raw → cleaned JSON |
| `seed-data.ts` / `check_seed.ts` | Load cleaned JSON / verify |
| `ingest-data.ts` / `ingest-data-continue.ts` | Generate embeddings / resume |
| `check-embeddings.ts`, `count-cases.ts` | Sanity counts |
| `test-chat.ts`, `test-chat-logic.ts`, `test-rag.ts`, `test-retrieval.ts` | Manual RAG smoke tests |
| `test-openai-key.ts`, `verify_connection.ts`, `verify-function.ts`, `verify_new_schema.ts`, `test-import.ts` | Env/db/function checks |

Run TS scripts with `npx tsx scripts/<name>.ts` (they load `.env` via dotenv and need `DATABASE_URL` + `OPENAI_API_KEY`).

## Ordering rule
Seeding must complete before ingesting (embeddings reference `case_id`). Re-running ingest after re-seeding requires clearing `case_embeddings` first or you get stale/duplicate chunks.

> Maintenance: new scripts get a row in the inventory table above.
