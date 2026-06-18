# Architecture — AGC2

## App Router structure
```
middleware.ts                      - Root middleware: session refresh + route guards (all routes except static assets)
src/app/
  layout.tsx                       - Root layout: wraps everything in <AppShell>
  page.tsx                         - Home: cases list (server component, Supabase server client)
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

## Authentication (Supabase Auth via @supabase/ssr)
Three Supabase client factories — use the right one for the context:

| File | Factory | Use in |
|---|---|---|
| `src/lib/supabase/client.ts` | `createBrowserClient` | `'use client'` components (login, sign-up, sign-out) |
| `src/lib/supabase/server.ts` | `createServerClient` + `next/headers` cookies | async Server Components (home, dashboard, case detail) |
| `src/lib/supabase/middleware.ts` | `createServerClient` with request/response cookie sync | root `middleware.ts` only |

`src/lib/supabaseClient.ts` is the older plain `@supabase/supabase-js` client — legacy; prefer the `src/lib/supabase/*` factories for anything auth-aware.

### Route guards (in `src/lib/supabase/middleware.ts` → `updateSession()`)
- `supabase.auth.getUser()` runs on **every** request (validates token against Supabase servers).
- **PUBLIC_PATHS**: `/auth/login`, `/auth/sign-up`, `/auth/forgot-password`, `/auth/reset-password`.
- **GUEST_ONLY**: `/auth/login`, `/auth/sign-up` — authenticated users are redirected to the `next` query param or `/`.
- Everything else requires auth; unauthenticated users → `/auth/login?next=<pathname>`.
- API routes are covered by the same matcher — they have **no explicit auth check inside the handlers**; unauthenticated API calls get the middleware redirect, not a 401.
- Matcher excludes `_next`, favicon, and image assets only.

### Gotchas
- `NEXT_PUBLIC_SUPABASE_URL!` / `NEXT_PUBLIC_SUPABASE_ANON_KEY!` use non-null assertions — missing env vars fail at runtime, not build.
- `next.config.ts` sets `transpilePackages: ['@supabase/ssr']` — required for the ESM-only package; do not remove.
- In `server.ts`, cookie writes are wrapped in try/catch because Server Components can't always mutate cookies.

## Layout shell
- `src/components/layout/AppShell.tsx` (client): if `pathname.startsWith('/auth')` → bare `<main>` (no sidebar); otherwise `flex h-screen` with `<Sidebar />` + scrollable main.
- `src/components/layout/Sidebar.tsx`: collapsible (`w-60` ↔ `w-16`), nav items hardcoded in `NAV_ITEMS` (`/dashboard`, `/` Senarai Kes, `/chat` Chat AI). Active-route logic: `/` also matches `/cases/*`. Sign-out calls `supabase.auth.signOut()` then `window.location.href = '/auth/login'` (hard reload on purpose — clears client state).

## Dashboard (`src/app/dashboard/page.tsx`)
- Server component; one query on `cases` (id, status, state_desc, source_folder, updated_at, file_open_date, file_no, case_name), ordered by `updated_at` desc. No joins.
- All metrics computed in the component: 4 metric cards, 6-month trend chart, last-5 activity log, 6 latest records, archive-health bars, top-4 states/categories.
- Status semantics: `SELESAI` = completed; anything else (or null) = active/unknown. Dates formatted with `ms-MY` locale.

## Two database clients (deliberate split)
- `pg` Pool (`src/lib/db.ts`) — API routes (chat RAG, PDF export). Dev mode caches the pool on `global` to survive hot reloads. Falls back to local Supabase docker (`127.0.0.1:54322`) when `DATABASE_URL` is unset.
- `@supabase/supabase-js` (via `src/lib/supabase/*`) — pages/components data fetching, auth.

## UI design
- Purple accent theme (`#4a1d96` primary), Tailwind CSS v4, Lucide icons, fonts Public Sans + Source Sans 3.
- UI language is Malay (Bahasa Melayu); keep new labels in Malay.

> Maintenance: when adding a route, auth rule, or layout behavior, update this file.
