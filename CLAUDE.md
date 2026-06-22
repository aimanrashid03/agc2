# AGC2 — CLAUDE.md

## Project Overview
**AGC2** = Attorney General's Chambers (Malaysia) Law Case Viewer. A Next.js web app for managing and querying Malaysian criminal law cases (LKK — Laporan Kes Kehakiman): searchable case table, metrics dashboard, RAG chat assistant, and official PDF report export. Deployed on Vercel. UI language is Malay (Bahasa Melayu).

> **Migrating to on-prem (in progress, started 2026-06-21).** The code today runs the cloud stack (Vercel + hosted Supabase + OpenAI, `vector(1536)`); the target is a client self-hosted Ubuntu VM: **Postgres + pgvector**, **Ollama** (`bge-m3` 1024d embeddings + `qwen2.5:7b-instruct`), Auth.js, and a recurring sync from the client's MySQL. Read [docs/on-prem-migration.md](docs/on-prem-migration.md) before any stack/DB/model/auth work — treat the current docs/skills as *current reality* and that doc as *the plan*.

## Tech Stack
- **Framework**: Next.js 16 (App Router), React 19, TypeScript 5 strict
- **Styling**: Tailwind CSS v4, `clsx` + `tailwind-merge`, Lucide icons, purple primary `#4a1d96`, fonts Public Sans + Source Sans 3
- **Auth + DB**: local dev = **Auth.js v5** (Credentials+JWT, `users` table) + **`pg` pool** against a local pgvector container (Supabase fully removed). Deployed cloud branch may still be Supabase until the VM cutover — see [docs/on-prem-migration.md](docs/on-prem-migration.md).
- **AI/RAG**: OpenAI `gpt-4o` + `text-embedding-3-small` (1536d), LangChain text splitters, pgvector
- **PDF**: pdfkit + svg-to-pdfkit (Node runtime only)

## Commands
```bash
npm run dev      # dev server on port 3001 (not 3000)
npm run build    # type-check + build — MUST pass with zero errors before any task is "done"
npm run lint     # ESLint
npx tsx scripts/<name>.ts   # pipeline/diagnostic scripts (need .env)
```

## Environment (`.env`; same vars on Vercel)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
DATABASE_URL       # Postgres connection string (pg pool; falls back to local docker 127.0.0.1:54322)
OPENAI_API_KEY     # not needed for build (dummy-key fallback), needed at runtime
```

## Documentation Map — read the matching doc BEFORE working on an area
| Area | Read first |
|---|---|
| **On-prem migration: Postgres/pgvector, Ollama models, Auth.js, MySQL sync, grounding** | [docs/on-prem-migration.md](docs/on-prem-migration.md) |
| Routes, auth/middleware, layout shell, dashboard, client choice | [docs/architecture.md](docs/architecture.md) |
| RAG chat pipeline, prompt/citation contract, thresholds | [docs/rag-chat.md](docs/rag-chat.md) |
| Schema, match_documents(), pg-vs-supabase clients | [docs/database.md](docs/database.md) |
| Clean → seed → ingest pipeline, data categories, scripts inventory | [docs/data-pipeline.md](docs/data-pipeline.md) |
| Laporan + Trend PDF generation, layout constants | [docs/pdf-export.md](docs/pdf-export.md) |
| Component prop contracts (non-obvious) | [docs/components.md](docs/components.md) |
| Env, first-time DB setup, smoke checks | [docs/local-setup.md](docs/local-setup.md) |

## Task Skills — invoke the matching skill at the START of the task
| Task type | Skill |
|---|---|
| Any React/UI/page/layout work (`src/app`, `src/components`) | `frontend` |
| Chat, RAG, embeddings, prompts, OpenAI config | `rag-chat` |
| PDF generation or export routes/buttons | `pdf-export` |
| Anything under `scripts/` or `data/` | `data-pipeline` |
| Schema, match_documents, RLS, connection handling | `database` |

Skills carry the task-specific rules, pinned numbers, and verification checklists. When skills overlap (e.g. the chat route touches DB), apply both.

## Hard Rules (always apply)
- TypeScript strict; `npm run build` must pass with **zero errors** before any task is "done".
- **Data access (Supabase removed)**: server reads use the `pg` pool — pages via `src/lib/cases.ts`, API routes/scripts via `src/lib/db.ts`; never import `pg` client-side. **Auth = Auth.js v5** (`src/auth.ts` + edge-safe `src/auth.config.ts`, gate in `src/proxy.ts`, `users` table); client auth actions use `signIn`/`signOut` from `next-auth/react`.
- API routes that use `pg` or pdfkit keep `export const runtime = 'nodejs'`.
- **Citation contract** (two-stage since the on-prem migration): chat prompt emits bare tags `[1]`; `route.ts` `expandTags()` rewrites them to `[[Nama Kes]](case_id)`; `ChatInterface.tsx` parses that — keep all three in sync.
- UI text in Malay; Tailwind only; Lucide icons; accent `#4a1d96`.
- Pinned RAG numbers — local dev (on-prem): bge-m3 **1024d**, refuse gate **0.59**, top 5, 1000/200 chunking; see the `rag-chat` skill / [docs/rag-chat.md](docs/rag-chat.md) before touching. (Deployed cloud still 1536d/gpt-4o/0.3.)
- Auth routes (`/api/auth/*`) and credential checks run on **`nodejs` runtime** (bcrypt + pg); the `src/proxy.ts` gate stays **edge-safe** (imports only `auth.config.ts`). In a `src/` project the gate MUST be `src/proxy.ts` (root file is ignored).
- Do not auto-commit; do not push unless asked; never force-push.
- Never run seed/ingest/schema scripts against a non-local `DATABASE_URL` without stating the target and getting confirmation.
- After changing a component contract, update [docs/components.md](docs/components.md); after schema changes, update [docs/database.md](docs/database.md). **Do not turn this file into a progress log** — feature docs go in `docs/`, history goes in git.

## Behavioral Rules

### Verify-After-Complete (MANDATORY)
After finishing any implementation, task, or plan — ALWAYS run a verification step before declaring it done.

| Work Type | Verification |
|---|---|
| Code / feature | `npm run build` (zero errors) |
| RAG/chat change | `npx tsx scripts/test-retrieval.ts` + one real chat with citations rendering |
| PDF change | Generate and OPEN a real PDF (long-content case for pagination) |
| Pipeline script | Run on local/dev data; check counts (`count-cases.ts`, `check-embeddings.ts`) |
| Config change | Re-read the config to confirm the change landed |
| Git operation | `git status` clean; `git log` shows the commit |
| Fact/data update | Grep for the OLD value (absent everywhere) AND the NEW value (present) |

- **Don't assume it worked** — run the check and report the actual output.
- **End-to-end over unit** — the most important check is the final output the user would see.
- **Report failures plainly** — never soften a failure into "mostly working".
- **Finish the current task before expanding scope** — note adjacent issues, don't detour.

### Diagnose-First (Before Any Fix)
Before writing any fix:
1. **Reproduce it** — run the failing command/page yourself; never fix from a description alone.
2. **Check git state** — `git status` (unstaged deletion?) and `git log --oneline -5` (already fixed?).
3. **Identify the error source** — editor diagnostic vs build error vs runtime log; confirm which before acting.
4. **Minimum viable diagnosis** — the simplest explanation that fits ALL the evidence; state it before fixing.

### Plan-First (MANDATORY)
ALWAYS enter plan mode before non-trivial changes — even if the user doesn't ask.
- **Non-trivial** = modifies >1 file, adds functionality, changes behavior, or touches config/middleware/schema.
- **Trivial** (skip plan) = single-line typo fix, one-file rename.
- Sequence: **Plan → User Review → Execute**.

### Verify-Before-Exit-Plan
Before presenting any plan, self-audit it:
1. **Count check** — "N files" claims match the actual list.
2. **Path check** — every path verified to exist (Read/Glob) or explicitly marked "new file".
3. **Wiring check** — for every new file/feature: who consumes it? Read the consumer and confirm.
4. **Policy check** — rules cited from CLAUDE.md/docs are quoted from the file, not from memory.
5. **Completeness check** — each item traced through its lifecycle: creation → wiring → type-check → (run/ingest if applicable).
6. **Stale value check** — when updating a fact, grep the whole target for the OLD value to catch stale copies.
