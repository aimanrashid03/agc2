# Legacy data pipeline (archived 2026-06-22)

These scripts were the original **manual JSON ingest path** for AGC2, retired when the
on-prem migration switched to reading the client MySQL database directly. They are kept
for historical reference only — they still target `data/cleaned/` and the old OpenAI
1536d embedding path, so **do not run them against the on-prem stack**.

| Archived script | What it did | Replaced by |
|---|---|---|
| `clean_legal_data.py` | SQL-dump → cleaned JSON under `data/cleaned/` | `scripts/sync-mysql.ts` (reads client MySQL directly) |
| `seed-data.ts` | cleaned JSON → Postgres (`cases`/`people`/`allegations`) | `scripts/sync-mysql.ts` (upsert on `source_id`) |
| `ingest-data-continue.ts` | resume a partial OpenAI 1536d embedding run | `scripts/ingest-data.ts` (incremental by default, Ollama bge-m3 1024d) |
| `feasibility-bakeoff.ts` | one-time model bake-off (qwen 3b/7b, SEA-LION) over `data/cleaned/` | decision landed: qwen2.5-7b + bge-m3 |

See [docs/on-prem-migration.md](../../on-prem-migration.md) for the current stack and
[docs/data-pipeline.md](../../data-pipeline.md) for the live `sync-mysql → ingest-data` path.
