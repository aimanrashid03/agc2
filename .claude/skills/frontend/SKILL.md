---
name: frontend
description: Use when creating or modifying React components, pages, layout, styling, or anything under src/app or src/components — covers auth-aware client choice, Malay UI language, table/selection contracts, and the build verification gate.
---

# Frontend Work — AGC2

## Before writing any code (mandatory pre-flight)
1. Read the component/page you're changing in full, plus at least one call site.
2. If it appears in [docs/components.md](../../../docs/components.md), read its contract there first — the table, tabs, and chat components have non-obvious coupling.
3. For feature areas, read the matching doc first: routing/auth/layout → docs/architecture.md; chat UI → docs/rag-chat.md; export buttons → docs/pdf-export.md.

## Hard rules
- **Data + auth access (Supabase removed)** — server components read via `src/lib/cases.ts` (`pg`); auth actions in `'use client'` components use `signIn`/`signOut` from `next-auth/react`; current user via `auth()` (server).
- **UI language is Malay** (Bahasa Melayu) — labels, buttons, error messages, empty states. English only in code identifiers and comments.
- Tailwind CSS v4 only (no CSS modules/styled-components); Lucide for icons; purple primary theme `#4a1d96`.
- Server components fetch via `src/lib/cases.ts` (pg); client components must not import `src/lib/db.ts` (pg is server-only — it will break the build/bundle).
- New pages outside `/auth/*` are automatically auth-protected by **`src/proxy.ts`** — don't add per-page auth checks; don't add public paths without updating `PUBLIC_PATHS` in `src/proxy.ts`.
- The citation regex in `ChatInterface.tsx` and the prompt rules in `src/app/api/chat/route.ts` are a matched pair — never change one without the other.
- Sidebar nav items are hardcoded in `NAV_ITEMS` (`src/components/layout/Sidebar.tsx`); new top-level pages need a row there.

## After the change (mandatory verification)
1. `npm run build` — must pass with **zero errors**. This is the gate; "it looks right" doesn't count.
2. If you changed a component's props, grep for ALL call sites and update each — then update [docs/components.md](../../../docs/components.md).
3. If you added a page, confirm: middleware guard behavior is what you intended, sidebar entry added (if top-level), and labels are in Malay.

## Common mistakes
- Importing the pg pool (`@/lib/db`) into a client component → build breaks or secrets leak.
- Putting the route gate at root `middleware.ts`/`proxy.ts` in this `src/` project → silently ignored (must be `src/proxy.ts`).
- English UI strings slipping in → inconsistent with the rest of the app.
- Changing the chat prompt's citation format without updating the frontend regex → citations silently stop being links.
