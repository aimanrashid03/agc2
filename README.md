# AGC Case Viewer (AGC2)

A web application for the Attorney General's Chambers (AGC) Malaysia to browse, search, and query Malaysian criminal law cases (LKK — Laporan Kes Kehakiman). It provides a searchable case table, a metrics dashboard, an AI legal assistant (RAG chat), and official PDF report export. The UI is in **Bahasa Melayu**.

> **Stack migrating to on-prem (in progress, started 2026-06-21).** This README and [docs/local-setup.md](docs/local-setup.md) describe the **current on-prem stack** that runs locally: **Postgres + pgvector**, **Ollama** (`bge-m3` embeddings + `qwen2.5` chat), and **Auth.js v5**. The **deployed** Vercel app may still use hosted Supabase (Auth + a few reads) until the VM cutover. Authoritative migration status: [docs/on-prem-migration.md](docs/on-prem-migration.md).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router), React 19, TypeScript 5 (strict) |
| Styling | Tailwind CSS v4, Lucide icons, purple accent `#4a1d96`, fonts Public Sans + Source Sans 3 |
| Database | PostgreSQL + **pgvector** (local: `pgvector/pgvector:pg16` via Docker; deployed: hosted Supabase until VM cutover) |
| Auth | **Auth.js v5** (Credentials + JWT, `users` table, `bcryptjs`); RBAC `officer` / `admin` |
| AI / RAG | **Ollama** (OpenAI-compatible API): `bge-m3` embeddings (1024d) + `qwen2.5-7b` chat (OpenRouter in dev), LangChain text splitting |
| PDF export | `pdfkit` + `svg-to-pdfkit` (Node runtime) |
| Data source | Recurring sync from the client's MySQL via `scripts/sync-mysql.ts` |
| Deployment | Vercel (cloud branch) → target: client on-prem Ubuntu VM |

## Project Structure

```
src/
  proxy.ts                    # Auth.js route guard (Next 16 "proxy"; MUST live in src/)
  auth.ts / auth.config.ts    # Auth.js v5 config (full / edge-safe)
  app/
    layout.tsx                # Root layout → <AppShell> + <SessionProvider>
    page.tsx                  # Home: searchable/paginated cases table (pg)
    dashboard/page.tsx        # Metrics dashboard
    cases/[id]/page.tsx       # Case detail view
    chat/page.tsx             # RAG chat page
    admin/page.tsx            # Admin panel (role 'admin' only)
    settings/page.tsx         # Account settings (all users)
    auth/{login,sign-up,forgot-password,reset-password}/page.tsx
    api/
      chat/route.ts                       # POST: RAG chat (Node runtime)
      cases/[id]/export-pdf/route.ts      # GET: single-case Laporan PDF
      cases/export-trend-pdf/route.ts     # POST: multi-case Trend PDF
      auth/{[...nextauth],register,change-password}/route.ts
      admin/{users,users/[id],users/[id]/reset-password,stats,chatbot-settings,chatbot-settings/avatar}/route.ts
      account/profile/route.ts            # PATCH own display name
      chatbot/avatar/route.ts             # GET chatbot avatar
  components/
    CasesTable.tsx, CaseContentTabs.tsx, ChatInterface.tsx, ChatWidget.tsx
    ExportPDFButton.tsx, MultiCaseExportButton.tsx
    layout/{AppShell,Sidebar}.tsx
    admin/{AdminPanel,ChatbotTab}.tsx, settings/SettingsTabs.tsx
    providers/Providers.tsx               # <SessionProvider>
  lib/
    db.ts                     # pg pool (API routes + scripts)
    cases.ts                  # page data access (pg) — replaces the old supabase client
    aiConfig.ts               # env-driven RAG/model config (gate, models, dimensions)
    auth-guard.ts             # getAdminSession() — server boundary for /admin
    laporanPdfGenerator.ts, trendOfSentencingPdfGenerator.ts
    chatbotSettings.ts, chatbotDefaults.ts, formatProse.ts
  types/index.ts              # Case, Person, Allegation interfaces

scripts/                      # Data pipeline & utilities (see docs/data-pipeline.md)
  setup-db.ts                 # Create schema (vector(1024) + roles + match_documents)
  setup-auth.ts               # Bootstrap users table + seed/promote a login
  sync-mysql.ts               # MySQL ilims_usr → Postgres (clean/categorize/upsert)
  ingest-data.ts              # bge-m3 embeddings (incremental)
docs/                         # Per-area docs (read before working an area — see CLAUDE.md)
  archive/legacy-pipeline/    # Retired cloud/JSON-path scripts (reference only)
```

## Database Schema

Core tables — full, idempotent definition in `scripts/setup-db.ts`:

- **cases** — case info (`file_no`, `status`, `case_name`, court/state, dates, `facts`, `judgement`, `result`, `suggestions`, plus `source_folder`, `act_tags`, `content_hash`).
- **people** — linked to a case via `case_id`; categories `accused`, `prosecutors`, `corum` (judges).
- **allegations** — charges per case (`act`, `section`, notes).
- **case_embeddings** — `vector(1024)` chunk embeddings for RAG.
- **users** — Auth.js credential store (email, bcrypt hash, `role`).
- **chatbot_settings** — single-row admin-editable chatbot branding/copy/avatar.

A PostgreSQL function `match_documents(query_embedding, match_threshold, match_count, match_filter)` performs the vector similarity search for the chatbot.

## Setup (local, on-prem stack)

Full prereqs, steps, and smoke checks: **[docs/local-setup.md](docs/local-setup.md)**. Quick version:

```bash
npm install                          # .npmrc sets legacy-peer-deps=true
cp .env.example .env.local           # fill in DATABASE_URL, AUTH_*, OLLAMA_URL, CHAT_*, MYSQL_*
docker compose up -d                 # local pgvector container (127.0.0.1:5432)
npx tsx scripts/setup-db.ts          # schema: vector(1024) + roles + match_documents
npx tsx scripts/setup-auth.ts --seed admin@agc.local agc12345 "Admin" admin   # users + an admin login
npx tsx scripts/sync-mysql.ts        # MySQL → Postgres (needs MYSQL_* + VPN)
npx tsx scripts/ingest-data.ts --sample 800   # bge-m3 embeddings (subset; full ~10h on CPU)
npm run dev                          # http://localhost:3001
```

Prereqs: Docker, Ollama with `bge-m3` + `qwen2.5:7b-instruct` pulled, and the client VPN (to reach MySQL).

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server on port **3001** |
| `npm run build` | Production build (type-check + build) — the quality gate; must pass with zero errors |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npx tsx scripts/<name>.ts` | Pipeline/diagnostic scripts (load `.env.local` via dotenv) |

Key scripts: `setup-db.ts`, `setup-auth.ts`, `sync-mysql.ts`, `ingest-data.ts`, `test-retrieval.ts`, `test-chat-v2.ts`, `count-cases.ts`, `diagnose-byname-gate.ts`. Full inventory in [docs/data-pipeline.md](docs/data-pipeline.md).

## How It Works

### Case browsing
Server components read Postgres via `src/lib/cases.ts` (the `pg` pool). The home page renders a searchable, paginated table; a case opens to a detail view (info, involved parties, charges, and tabbed facts/judgement/issues/suggestions). `/dashboard` computes metrics from a single `cases` query.

### AI assistant (RAG)
1. The user asks a question via `/chat` (or the site-wide floating widget).
2. The query is embedded with **bge-m3** (Ollama).
3. `match_documents` retrieves the top-5 case chunks; a **refusal gate** (`sim < 0.59`) returns a refusal *without calling the LLM* for out-of-database questions.
4. Each retrieved case's official verdict (`cases.result`) is joined into the context, and cases are labelled `[1] [2] …`.
5. **qwen2.5-7b** streams an answer citing bare tags `[1]`; the route expands them to `[[Case Name]](case_id)`, which the UI renders as links to `/cases/:id`.

All RAG knobs (models, dimensions, gate, match count) live in `src/lib/aiConfig.ts`. Details: [docs/rag-chat.md](docs/rag-chat.md).

### Auth & RBAC
Auth.js v5 (Credentials + JWT) against the `users` table. `src/proxy.ts` gates all non-public routes; `/admin/*` additionally requires `role === 'admin'` via `getAdminSession()` (`src/lib/auth-guard.ts`). Account provisioning and password reset are local-dev choices to confirm at VM setup — see [docs/on-prem-migration.md](docs/on-prem-migration.md).

### PDF export
`pdfkit` + `svg-to-pdfkit` generate the single-case **Laporan** and multi-case **Trend** PDFs from Node-runtime API routes. See [docs/pdf-export.md](docs/pdf-export.md).

### UI language
The interface is primarily in **Bahasa Melayu**; the chatbot answers in Malay by default.

## Deployment

Currently Vercel (push to the `CloudDeploy` branch to deploy; it may still use hosted Supabase until cutover). The **target** is the client's self-hosted Ubuntu VM — Postgres + pgvector + Ollama, CPU-only. Migration plan, VM specs, and open blockers: **[docs/on-prem-migration.md](docs/on-prem-migration.md)**.
