# Data Pipeline — AGC2

Source data is Malaysian criminal case records (LKK — Laporan Kes Kehakiman).

## Current path (on-prem, local dev): **sync → ingest**
`scripts/sync-mysql.ts` reads the client's `ilims_usr` MySQL directly (`LT_LKK_INFO` + `LT_LKK_ALLEGATION` + `LT_LKK_PERSON_INVOLVE`), cleans every text field (HTML strip + entity unescape, ported from `clean_legal_data.py`; plus `denull()` which voids leaked dropdown placeholders like `Sila pilih..`/`-`/`N/A` in `court_desc`/`state_desc`), **triages** junk/empty rows (logged, not silently dropped), derives **categorization** (primary Act → `source_folder` by a severity rank in `SEVERITY`; all acts → `act_tags`), and **upserts** into Postgres (`cases`/`people`/`allegations`) on `source_id`. It writes `content_hash` so ingest can skip unchanged cases. Then `scripts/ingest-data.ts` embeds with Ollama `bge-m3` (1024d), incrementally.
```bash
npx tsx scripts/sync-mysql.ts [--dry] [--limit N]      # MySQL -> Postgres
npx tsx scripts/ingest-data.ts [--sample N] [--limit N] # bge-m3 embeddings (incremental)
```
Needs `MYSQL_*`, `DATABASE_URL`, `OLLAMA_URL` in `.env.local` and the VPN up to reach MySQL. See [on-prem-migration.md](on-prem-migration.md).

## Legacy path (manual JSON drop): **clean → seed → ingest**
**Archived** to [docs/archive/legacy-pipeline/](archive/legacy-pipeline/) now that data comes from MySQL: `clean_legal_data.py` (SQL-dump → JSON) → `seed-data.ts` (JSON → Postgres) → `ingest-data-continue.ts` (OpenAI resume). Kept for reference only — see that folder's README.

> ⚠️ The **Stages** and **Incremental case adds** sections below document this **archived** path — those scripts now live in `docs/archive/legacy-pipeline/` and must not be run against the on-prem stack. For the live flow use `sync-mysql.ts` → `ingest-data.ts` (above).

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
| `setup-db.ts` | Create/recreate schema (`vector(1024)`, role bootstrap) + `match_documents` |
| **`sync-mysql.ts`** | **MySQL → Postgres: clean + triage + categorize + upsert (current data source)** |
| **`inspect-mysql.ts` / `inspect-lkk.ts`** | **Read-only MySQL schema/data inspection (diagnostics)** |
| `ingest-data.ts` | Generate `bge-m3` embeddings from Postgres, incremental (`--sample`/`--limit`) |
| `clean_legal_data.py`, `seed-data.ts`, `ingest-data-continue.ts`, `feasibility-bakeoff.ts` | **Legacy** — archived to `docs/archive/legacy-pipeline/` (manual JSON path / OpenAI ingest / model bake-off) |
| `check-embeddings.ts`, `count-cases.ts`, `check_seed.ts` | Sanity counts |
| `test-retrieval.ts` (bge-m3) / `test-chat-v2.ts` (E2E qwen) | Current RAG smoke tests |
| `setup-auth.ts` | Idempotent `users` table create + `--seed` a login (Auth.js) |
| `test-auth.ts`, `test-pages-data.ts` | Auth credential logic + page `pg` reads smoke tests |
| `verify_new_schema.ts` | Post-seed schema sanity check |

Run TS scripts with `npx tsx scripts/<name>.ts` (they load `.env.local` via dotenv and need `DATABASE_URL`; ingest also needs `OLLAMA_URL`, sync needs `MYSQL_*`).

## Ordering rule
Seeding must complete before ingesting (embeddings reference `case_id`). Re-running ingest after re-seeding requires clearing `case_embeddings` first or you get stale/duplicate chunks.

## Incremental case adds (one new act = one new folder)
To add more cases without re-uploading every act, drop the new batch into its **own new** `data/cleaned/<NEW ACT>/` folder (never append to an already-seeded folder), then run the seed + ingest scripts **scoped to that folder**:

```bash
npx tsx scripts/seed-data.ts "<NEW ACT>"                # seeds only that folder
npx tsx scripts/ingest-data-continue.ts "<NEW ACT>"     # embeds only that folder's new cases
npx tsx scripts/count-cases.ts && npx tsx scripts/check-embeddings.ts
```

Both scripts take optional folder-name args (`process.argv.slice(2)`); with no args they process every folder (unchanged full-seed behavior). Idempotency: `cases` upserts on `(source_id, source_folder)`, `people`/`allegations` carry `UNIQUE(case_id, source_id)` + `ON CONFLICT DO NOTHING`, and `ingest-data-continue.ts` skips already-embedded cases — so a re-run of the same folder adds zero duplicates.

> Maintenance: new scripts get a row in the inventory table above.
