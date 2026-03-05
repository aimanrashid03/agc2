# AGC Case Viewer

A web application for the Attorney General's Chambers (AGC) Malaysia to browse, search, and query criminal law cases (LKK - Laporan Kes Kehakiman). Includes an AI-powered legal chatbot that answers questions about cases using Retrieval-Augmented Generation (RAG).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router), React 19, TypeScript 5 |
| Styling | Tailwind CSS v4, Lucide icons |
| Database | PostgreSQL via Supabase (hosted) |
| AI / RAG | OpenAI GPT-4o (chat), text-embedding-3-small (embeddings), LangChain (text splitting) |
| Deployment | Vercel |

## Project Structure

```
src/
  app/
    page.tsx                  # Home - paginated cases table
    layout.tsx                # Root layout (sidebar + main area)
    loading.tsx               # Global loading state
    not-found.tsx             # 404 page
    chat/
      page.tsx                # AI chatbot page
    cases/
      [id]/page.tsx           # Case detail view
    api/
      chat/route.ts           # POST /api/chat - RAG chat endpoint
  components/
    CasesTable.tsx            # Searchable, paginated cases table
    ChatInterface.tsx         # Chat UI with streaming + citation links
    CaseContentTabs.tsx       # Tabbed view (Facts, Judgement, Issues, Suggestions)
    layout/
      Sidebar.tsx             # Collapsible sidebar navigation
  lib/
    db.ts                     # PostgreSQL connection pool (pg) - used by API routes
    supabaseClient.ts         # Supabase client - used by pages for data fetching
  types/
    index.ts                  # TypeScript interfaces (Case, Person, Allegation)

scripts/                      # One-off data pipeline & utility scripts
  setup-db.ts                 # Creates all tables, functions, RLS policies
  seed-data.ts                # Seeds DB from cleaned JSON data
  ingest-data.ts              # Generates vector embeddings for RAG
  clean_legal_data.py         # Python script to clean raw legal data

data/
  cleaned/                    # Cleaned JSON data by category
    AKTA KANUN KESEKSAAN/     # Penal Code cases
    AKTA PENCULIKAN 1961/     # Kidnapping Act cases
    Seksyen 39B/              # Drug trafficking cases
    TPR Chan Lee Lee/
    Lain-lain/                # Others

supabase/
  migrations/                 # SQL migration (full schema definition)
```

## Database Schema

Four main tables:

- **cases** - Core case info (file_no, status, case_name, court, state, dates, judgement, facts, suggestions, etc.)
- **people** - Linked to cases via `case_id`. Categories: `accused`, `prosecutors`, `corum` (judges)
- **allegations** - Charges per case (act, section, charge notes)
- **case_embeddings** - Vector embeddings for RAG semantic search

A PostgreSQL function `match_documents()` performs vector similarity search for the chatbot.

## Setup

### Prerequisites

- Node.js 20+
- npm
- A Supabase project (or local Supabase instance)
- An OpenAI API key (for the chatbot and embeddings)

### 1. Clone and install

```bash
git clone <repo-url>
cd agc2
npm install
```

> Note: `.npmrc` has `legacy-peer-deps=true` set to resolve dependency conflicts.

### 2. Environment variables

Create a `.env.local` file in the project root:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# PostgreSQL direct connection (used by API routes and scripts)
DATABASE_URL=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres

# OpenAI (required for chat and embedding generation)
OPENAI_API_KEY=sk-...
```

Ask the project lead for the actual values.

### 3. Set up the database

If starting from scratch (empty Supabase project), run the setup script to create all tables, functions, and RLS policies:

```bash
npx tsx scripts/setup-db.ts
```

### 4. Seed data

Load the cleaned legal data into the database:

```bash
npx tsx scripts/seed-data.ts
```

### 5. Generate embeddings (for RAG chatbot)

This chunks case text and creates vector embeddings. Requires a valid `OPENAI_API_KEY`:

```bash
npx tsx scripts/ingest-data.ts
```

### 6. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) to view the app.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 3001 |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npx tsx scripts/setup-db.ts` | Create DB schema from scratch |
| `npx tsx scripts/seed-data.ts` | Seed cases, people, allegations |
| `npx tsx scripts/ingest-data.ts` | Generate RAG embeddings |

## How It Works

### Case Browsing
The home page fetches all cases from Supabase with joined people and allegations. Cases are displayed in a searchable, paginated table. Clicking a case opens a detail view with info sidebar, involved parties, charges, and tabbed content (facts, judgement, issues, suggestions).

### AI Chatbot (RAG)
1. User sends a question via `/chat`
2. The API generates an embedding of the query using OpenAI
3. Vector similarity search (`match_documents`) retrieves the top 5 relevant case chunks
4. Retrieved context is injected into a system prompt (Malay legal assistant persona)
5. GPT-4o generates a streaming response with citation links
6. Citations like `[[Case Name]](case_id)` render as clickable links to case detail pages

### UI Language
The interface is primarily in **Bahasa Melayu**. The chatbot defaults to Malay responses unless the user asks in English.

## Deployment

The app is deployed on Vercel. The `CloudDeploy` branch is the deployment branch. Push to it to trigger a new deployment.
