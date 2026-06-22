# Architecture — AGC2

## App Router structure
```
src/proxy.ts                       - Route guard (Auth.js; Next 16 "proxy"); MUST be in src/ for a src/ project
src/app/
  layout.tsx                       - Root layout: wraps everything in <AppShell>
  page.tsx                         - Home: cases list (server component, pg via src/lib/cases.ts)
  loading.tsx / not-found.tsx      - Loading state / 404
  dashboard/page.tsx               - Metrics dashboard (server component)
  cases/[id]/page.tsx              - Case detail (server component)
  chat/page.tsx                    - RAG chat page wrapper
  auth/login/page.tsx              - Login (client component)
  auth/sign-up/page.tsx            - Sign-up (min password length 8)
  auth/forgot-password/page.tsx    - Sends reset email
  auth/reset-password/page.tsx     - Sets new password (min 8)
  api/chat/route.ts                - POST: RAG chat (Node runtime) — see docs/rag-chat.md
  api/cases/[id]/export-pdf/route.ts        - GET: single-case Laporan PDF — see docs/pdf-export.md
  api/cases/export-trend-pdf/route.ts       - POST: multi-case Trend PDF — see docs/pdf-export.md
```

## Authentication (Auth.js v5 — Supabase Auth removed 2026-06-22)
Credentials provider + JWT sessions against the Postgres `users` table (bcrypt via `bcryptjs`).

| File | Role |
|---|---|
| `src/auth.config.ts` | **Edge-safe** config (no Node deps) — `pages`, `session: jwt`. Imported by `src/proxy.ts`. |
| `src/auth.ts` | Full `NextAuth({...authConfig, providers: [Credentials]})`; `authorize()` does pg lookup + `bcrypt.compare`. Exports `handlers/auth/signIn/signOut`. **Node runtime.** |
| `src/app/api/auth/[...nextauth]/route.ts` | NextAuth GET/POST handler (`runtime = 'nodejs'`). |
| `src/app/api/auth/register/route.ts` | Self-service sign-up (local dev): validate + `bcrypt.hash` + insert. |
| `src/app/api/auth/change-password/route.ts` | Logged-in self password change (verifies current). |
| Client auth actions | `signIn`/`signOut` from `next-auth/react` (login page, Sidebar). |

### Route guards (`src/proxy.ts`)
- **Next 16 renamed `middleware`→`proxy`.** In a `src/` project the gate MUST be `src/proxy.ts` — a root `middleware.ts`/`proxy.ts` is **silently ignored** (the old Supabase middleware was at root and likely never gated).
- Edge-safe NextAuth instance from `auth.config.ts`; `req.auth` = session or null (JWT verified with `AUTH_SECRET`, no DB call).
- **PUBLIC_PATHS**: `/auth/{login,sign-up,forgot-password,reset-password}`. **GUEST_ONLY**: `/auth/{login,sign-up}` → logged-in users bounce to `next` or `/`.
- Everything else requires auth; unauthenticated → `/auth/login?next=<pathname>`. Matcher excludes `/api/auth/*` (must stay ungated or sign-in self-redirects), `_next`, favicon, images.

### Gotchas
- Env: `AUTH_SECRET` (required), `AUTH_URL`, `AUTH_TRUST_HOST=true`. No `NEXT_PUBLIC_SUPABASE_*` anymore.
- Provisioning (self-signup) + password reset (self-reset, no email) are **local-dev choices to re-decide at VM setup** — see docs/on-prem-migration.md.

## Layout shell
- `src/components/layout/AppShell.tsx` (client): if `pathname.startsWith('/auth')` → bare `<main>` (no sidebar); otherwise `flex h-screen` with `<Sidebar />` + scrollable main.
- `src/components/layout/Sidebar.tsx`: collapsible (`w-60` ↔ `w-16`), nav items hardcoded in `NAV_ITEMS` (`/dashboard`, `/` Senarai Kes, `/chat` Chat AI). Active-route logic: `/` also matches `/cases/*`. Sign-out calls `signOut({ redirectTo: '/auth/login' })` from `next-auth/react`.

## Dashboard (`src/app/dashboard/page.tsx`)
- Server component; one query on `cases` (id, status, state_desc, source_folder, updated_at, file_open_date, file_no, case_name), ordered by `updated_at` desc. No joins.
- All metrics computed in the component: 4 metric cards, 6-month trend chart, last-5 activity log, 6 latest records, archive-health bars, top-4 states/categories.
- Status semantics: `SELESAI` = completed; anything else (or null) = active/unknown. Dates formatted with `ms-MY` locale.

## Two database clients (deliberate split)
- `pg` Pool (`src/lib/db.ts`) — API routes (chat RAG, PDF export, auth) + pages via `src/lib/cases.ts`. Dev caches the pool on `global` across hot reloads. Local dev points `DATABASE_URL` at the pgvector container (`127.0.0.1:5432`).
- `next-auth` (Auth.js v5) — authentication; `bcryptjs` — password hashing. **No supabase-js.**

## UI design
- Purple accent theme (`#4a1d96` primary), Tailwind CSS v4, Lucide icons, fonts Public Sans + Source Sans 3.
- UI language is Malay (Bahasa Melayu); keep new labels in Malay.

> Maintenance: when adding a route, auth rule, or layout behavior, update this file.
