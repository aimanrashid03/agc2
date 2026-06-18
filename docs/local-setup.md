# Local Setup — AGC2

## Prerequisites
- Node 20+, npm. Python 3 only if running the data-cleaning stage.
- A Supabase project (hosted) — or local Supabase via docker (the `pg` pool falls back to `127.0.0.1:54322`).

## Environment (`.env`)
```
NEXT_PUBLIC_SUPABASE_URL=        # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # Supabase anon key
DATABASE_URL=                    # Postgres connection string (Supabase pooler or local)
OPENAI_API_KEY=                  # embeddings + gpt-4o chat
```
The two `NEXT_PUBLIC_*` vars are consumed with non-null assertions — the app crashes at runtime (not build) without them. `next build` works without `OPENAI_API_KEY` (dummy-key fallback in the chat route).

## Commands
```bash
npm run dev      # Next dev server on port 3001 (not 3000)
npm run build    # next build — the quality gate; must pass with zero errors
npm run start    # serve production build
npm run lint     # ESLint
```

## First-time database
```bash
npx tsx scripts/setup-db.ts        # create schema + match_documents()
npx tsx scripts/seed-data.ts       # load data/cleaned/** into cases/people/allegations
npx tsx scripts/ingest-data.ts     # chunk + embed into case_embeddings (needs OPENAI_API_KEY; costs money)
```
Order matters: setup → seed → ingest. See [docs/data-pipeline.md](data-pipeline.md).

## Smoke checks
```bash
npx tsx scripts/verify_connection.ts   # DB reachable
npx tsx scripts/count-cases.ts         # seeded rows
npx tsx scripts/test-retrieval.ts      # vector search works
```

## Auth note
All pages except `/auth/*` require a logged-in Supabase user — create one via `/auth/sign-up` on first run.

## Deployment
Vercel. Set all four env vars in the Vercel project; `transpilePackages: ['@supabase/ssr']` in `next.config.ts` must stay.
