# AGC2 - Claude Code Instructions

## Project Overview
**AGC2** = Attorney General's Chambers (Malaysia) Law Case Viewer. A Next.js web app for managing and querying Malaysian criminal law cases (LKK - Laporan Kes Kehakiman). Deployed on Vercel.

## Tech Stack
- **Framework**: Next.js (App Router), React 19, TypeScript 5
- **Styling**: Tailwind CSS v4, `clsx`, `tailwind-merge`, Lucide icons
- **Database**: PostgreSQL via Supabase (hosted). Two clients:
  - `pg` Pool (`src/lib/db.ts`) — used by API routes (chat RAG)
  - `@supabase/supabase-js` (`src/lib/supabaseClient.ts`) — used by pages for data fetching
- **AI/RAG**: OpenAI (`gpt-4o` + `text-embedding-3-small`), LangChain text splitters
- **Fonts**: Public Sans, Source Sans 3
- **Dev port**: 3001

## App Router Structure
```
src/app/
  page.tsx              - Home: server component, fetches cases via Supabase
  layout.tsx            - Root layout: sidebar + main content area, flex h-screen
  loading.tsx           - Loading state
  not-found.tsx         - 404 page
  chat/page.tsx         - Chat page wrapper
  cases/[id]/page.tsx   - Case detail (server component)
  api/chat/route.ts     - POST endpoint for RAG chat (Node.js runtime)
```

## Key Components
- `src/components/CasesTable.tsx` — Paginated, searchable cases table
- `src/components/ChatInterface.tsx` — Chat UI with streaming, citation links
- `src/components/CaseContentTabs.tsx` — Tabbed view (Facts, Judgement, Issues, Suggestions)
- `src/components/layout/Sidebar.tsx` — Collapsible sidebar nav
- `src/types/index.ts` — Case, Person, Allegation interfaces

## Database Schema
- `cases` — id, source_id, source_folder, file_no, status, case_name, court_desc, state_desc, file_open_date, result, result_date, appeal_date, grounds_of_judgement, case_facts, issues_and_arguments, dpp_suggestion, dsp_suggestion, raw_data (jsonb)
- `people` — id, case_id (FK), source_id, role, category, name, id_no, email, phone, address, raw_data
- `allegations` — id, case_id (FK), source_id, type, section, act_desc, charge_notes, okt_name, charge_created_date, raw_data
- `case_embeddings` — case_id (FK), content, metadata (jsonb), embedding (vector)
- `match_documents()` — PG function for vector similarity search

## Data Model Relationships
- Cases have many People (accused, prosecutors, judges/corum)
- Cases have many Allegations (charges with act/section)
- Cases have many Embeddings (chunked text for RAG)

## RAG Chat Flow
1. User sends message → POST `/api/chat`
2. API generates embedding via OpenAI `text-embedding-3-small`
3. Vector similarity search via `match_documents()` (threshold 0.3, top 5)
4. Context injected into system prompt (Malay legal assistant persona)
5. GPT-4o generates streaming response
6. Frontend renders stream with citation links `[[Case Name]](case_id)` → clickable `/cases/:id`

## Data Pipeline
1. Raw legal data cleaned by `scripts/clean_legal_data.py` → `data/cleaned/<category>/clean_info.json`, `clean_people.json`, `clean_allegation.json`
2. `scripts/seed-data.ts` loads cleaned JSON into cases/people/allegations tables
3. `scripts/ingest-data.ts` chunks case text (LangChain splitter) + generates OpenAI embeddings → `case_embeddings`

## Data Categories
- AKTA KANUN KESEKSAAN (Penal Code)
- AKTA PENCULIKAN 1961 (Kidnapping Act)
- Seksyen 39B (Drug trafficking)
- TPR Chan Lee Lee
- Lain-lain (Others)

## UI Design
- Purple accent theme (`#4a1d96` primary)
- Collapsible sidebar with nav links (Senarai Kes, Chat AI, Tetapan)
- Cases table: searchable, paginated (10/20/50 rows)
- Case detail: 3-col layout (1 info sidebar + 2 content area)
- Chat: streaming responses with localStorage persistence
- UI language: primarily Malay (Bahasa Melayu)

## Required Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
DATABASE_URL       # PostgreSQL connection string
OPENAI_API_KEY
```
