# Database — AGC2

PostgreSQL. **Local dev** now runs a `pgvector/pgvector:pg16` container (`docker-compose.yml`, `127.0.0.1:5432`) mirroring the on-prem VM; the deployed app still points `DATABASE_URL` at hosted Supabase. Schema is created by `scripts/setup-db.ts` (idempotent; drops/recreates everything). `setup-db.ts` also bootstraps the `anon/authenticated/service_role` roles via a `DO` block, because those exist on Supabase but **not** on plain Postgres — without it the grants abort.

## Tables
| Table | Columns (key ones) |
|---|---|
| `cases` | id, source_id, source_folder (**= primary Act**), file_no, status, case_name, court_desc, state_desc, file_open_date, result, result_date, appeal_date, grounds_of_judgement, case_facts, issues_and_arguments, dpp_suggestion, dsp_suggestion, raw_data (jsonb), **content_hash** (sha256 of embed-source text → incremental ingest), **act_tags** (text[] — every Act the case has charges under) |
| `people` | id, case_id (FK), source_id, role, category, name, id_no, email, phone, address, raw_data |
| `allegations` | id, case_id (FK), source_id, type, section, act_desc, charge_notes, okt_name, charge_created_date, raw_data |
| `case_embeddings` | case_id (FK), content, metadata (jsonb — incl. `content_hash`, `source_folder`), embedding `vector(1024)` (**bge-m3**; was `vector(1536)` OpenAI) |
| `users` | id, email, password_hash (bcrypt), name, role (default `officer`), created_at, updated_at — **Auth.js Credentials store** (replaces Supabase Auth). Case-insensitive unique on `lower(email)`. Create idempotently via `scripts/setup-auth.ts` (also in `setup-db.ts`); seed with `--seed <email> <pw> [name]`. |

## Relationships
- A case has many People (accused/OKT, prosecutors/TPR, judges/corum), many Allegations (charges with act + section), and many Embeddings (chunked text for RAG).
- `raw_data` jsonb holds the original source-system JSON; several UI fields fall back to nested paths inside it (e.g. `LTL_DATA.namaPerayuResponden` in the PDF generator).

## `match_documents()` function
- Signature: `match_documents(query_embedding text, match_threshold float, match_count int, match_filter jsonb)`.
- Vector similarity search over `case_embeddings`; granted to `anon, authenticated, service_role`.
- Called from the chat API route via the `pg` pool with a stringified vector (`[0.1,0.2,...]`).
- `scripts/setup-db.ts` drops older overloads (`vector(1536)`, 3-arg text version) before creating the current 4-arg one — keep that cleanup if you change the signature again.

## Access patterns (which client where)
| Caller | Client | Why |
|---|---|---|
| API routes (chat, PDF export, auth) | `pg` Pool from `src/lib/db.ts` | raw SQL, `match_documents`, multi-table joins, `users` lookups |
| Pages / server components | `pg` via `src/lib/cases.ts` | `getCasesForList` (slim flat projection — list/table; derives okt_name/akta/seksyen in SQL, **no `raw_data`/relations**, ~1.8 MB vs the ~146 MB full read), `getCaseWithRelations` (full nested — detail page), `getDashboardCases` (lightweight cols). `to_jsonb` for ISO dates / nested shape |
| Auth (login / session / sign-out) | Auth.js (`src/auth.ts`, `next-auth/react`) | credential login, JWT session — **no supabase-js anywhere** |

`src/lib/db.ts` caches the Pool on `global` in dev (survives Next.js hot reload) and falls back to `postgresql://postgres:postgres@127.0.0.1:54322/postgres` when `DATABASE_URL` is unset. **Local dev sets `DATABASE_URL` to the pgvector container at `127.0.0.1:5432`** (the `54322` fallback is the older local-Supabase default and is not used).

## Status values
`cases.status` effectively has two UI values: `SELESAI` and `BELUM SELESAI` (the table filter hardcodes these). Dashboard treats `SELESAI` as completed, everything else as active/unknown.

> Maintenance: schema changes go in `scripts/setup-db.ts`; document them here in the same change.
