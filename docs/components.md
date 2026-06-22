# Component Contracts — AGC2

Non-obvious prop contracts and behaviors. Update when a contract changes.

## CasesTableWrapper (`src/components/CasesTableWrapper.tsx`)
Props: `{ cases: CaseListItem[]; categories: {value,label}[]; states: string[] }`
- Owns multi-select state; renders a selection banner (count + `MultiCaseExportButton` + clear-X) when anything is selected.
- Passes `selectedCaseIds` + `onSelectedCasesChange` down to `CasesTable`.

## CasesTable (`src/components/CasesTable.tsx`)
Props: `{ cases: CaseListItem[], categories, states, selectedCaseIds?, onSelectedCasesChange? }`
- `cases` is the **slim `CaseListItem` projection** (not full `Case`) from `getCasesForList` — `okt_name`/`akta`/`seksyen` are derived in SQL, no `raw_data`/relations. Keeps the home payload ~1.8 MB (was ~146 MB). Don't reach for fields outside `CaseListItem` here.
- 10 columns incl. checkbox (40px) and a single combined **Tindakan** column (88px) holding the view icon + per-row PDF download side by side. Most columns are drag-resizable (min 40px); **widths are local state — lost on re-render, not persisted**.
- Filters: text search (file_no, case_name, okt_name) on the toolbar; everything else lives in a single **"Penapis"** popover (count badge + outside-click close) with **Kategori, Status, Negeri, Jenis Mahkamah, Mahkamah (Lokasi), Akta, and a Tarikh Buka date range**. Active filters also render as removable chips under the toolbar. Mahkamah/Akta options are derived **client-side** from `cases` (no extra props): **Jenis Mahkamah** = court type from `courtTypeOf(court_desc)` prefix-match (Persekutuan/Rayuan/Tinggi/Rendah, apex-first via `COURT_TYPE_ORDER`; Sesyen+Majistret → "Mahkamah Rendah"); only types present in the data are shown. **Mahkamah (Lokasi)** = distinct `court_desc` (junk like `Sila pilih..`/blanks dropped — only `MAHKAMAH …` kept), narrowed to the chosen Jenis Mahkamah (and cleared when the type changes). Akta = the comma-joined `akta` aggregate split into individual acts, matched by case-insensitive `includes`. Date range compares the `file_open_date` ISO prefix against the `<input type=date>` values. "Kes Dadah" is a special category: `source_folder` **or** akta contains `DADAH`/`BERBAHAYA` (the old `39B` folder no longer exists; the drug folder is hidden from the category dropdown since this umbrella option covers it). Category labels are Title-Cased + sorted by frequency in `page.tsx`.
- Status dropdown hardcodes exactly two values: `SELESAI`, `BELUM SELESAI`.
- Sort default: `file_open_date` desc; nulls sort to the end. Any filter change resets to page 1.
- Pagination: 10 (default) / 20 / 50 rows.
- Row click expands inline details (also keyboard-operable: `tabIndex`/Enter/Space + `aria-expanded`); selection and expansion are independent.
- Accessibility: `aria-label`s on search/filters/checkboxes/pagination, visually-hidden `<caption>`, `focus-visible` rings; empty cells render a muted `-`, truncated cells expose full text via `title`.

## CaseContentTabs (`src/components/CaseContentTabs.tsx`)
Props: `{ facts, judgement, issues, suggestions }` — all `string | null`
- Renders only tabs whose content is non-null; returns `null` if all four are null.
- Tabs: Fakta Kes, Alasan Penghakiman, Isu & Hujahan, Cadangan. First available tab active by default.
- Renders content through `ProseBlock` (see its entry) so the unstructured seed text becomes readable paragraphs instead of a wall; fixed 600px height with internal scroll.

## ProseBlock (`src/components/ProseBlock.tsx`)
Props: `{ text: string | null | undefined; className?: string }`. No client hooks → usable from **both** server components (case detail page `charge_notes`) and client components (`CaseContentTabs`).
- Delegates to the pure `formatProse()` (`src/lib/formatProse.ts`), which turns a continuous wall of legal narrative (the seed data has **no** paragraph breaks) into ~300-char paragraphs by abbreviation/decimal-aware sentence grouping — it only inserts breaks, never edits words (dates like `16/4/2022`, money `RM1,000.00`, and `No. B-21-2A` are not mis-split). Returns `null` for empty text.
- `className` styles the wrapper (type scale/colour, e.g. `max-w-3xl text-[15px] text-gray-700`); per-paragraph rhythm (`mb-4 leading-7`) is fixed inside the component.

## ChatInterface (`src/components/ChatInterface.tsx`)
- Props: `Partial<ChatbotSettings> & { onClose?: () => void }` — `botName`, `welcomeHeading`, `welcomeSubtitle`, `starterPrompts`, `maintenanceEnabled`, `maintenanceMessage`, `avatarSrc`. Admin-configurable, defaulted from `src/lib/chatbotDefaults.ts`. The server page `src/app/chat/page.tsx` (`export const dynamic = 'force-dynamic'`) reads them via `getChatbotSettings()` and spreads them in; falls back to defaults if the `chatbot_settings` table is absent.
- `onClose` (optional): when provided, a minimize/close (`ChevronDown`) button appears in the header next to the clear button. Used by `ChatWidget`; the `/chat` page omits it. The clear button label is **"Kosongkan Chat"**.
- Message shape: `{ role: 'user' | 'assistant', content: string }`.
- Citation regex parses `[[Name]](id)` (primary) and `[Name](id)` (fallback) → links to `/cases/:id`. **Coupled to the system prompt in `src/app/api/chat/route.ts`** — change both together.
- Persists to `localStorage['chat_messages']`; clear button wipes state + storage.
- Starter-question chips call `sendMessage(prompt)` directly. When `maintenanceEnabled`, the welcome/chips are replaced by a notice banner and the input is disabled (the chat route also returns the notice server-side, so it can't be bypassed). Avatar `<Image>`s use `unoptimized` (the src can be the dynamic `/api/chatbot/avatar`).

## ChatWidget (`src/components/ChatWidget.tsx`)
Props: `ChatbotSettings` (spread directly — `<ChatWidget {...chatbotSettings} />`). `'use client'`.
- Floating bottom-right launcher (FAB showing the bot avatar + online dot) that toggles a panel embedding `<ChatInterface {...settings} onClose={…} />`. `Esc` closes and returns focus to the launcher; default state is closed.
- Mounted **once, site-wide** by `AppShell`, which suppresses it on `/chat`, `/settings`, `/admin` (and subpaths via `HIDE_WIDGET_ON`) and on `/auth/*` (AppShell's early return). Only one `ChatInterface` is mounted at a time, so the shared `localStorage['chat_messages']` history persists across pages and widget open/close with no concurrent writer; only "Kosongkan Chat" clears it.
- Settings originate in the root layout (`await getChatbotSettings()`) → `AppShell` → here, so the widget honors the same admin branding/maintenance config as the `/chat` page.

## ExportPDFButton / MultiCaseExportButton
See [docs/pdf-export.md](pdf-export.md#frontend-buttons).

## AppShell / Sidebar (`src/components/layout/`)
- `AppShell`: hides sidebar entirely when `pathname.startsWith('/auth')`. Takes `chatbotSettings: ChatbotSettings` and mounts the site-wide `ChatWidget` (see its entry) on non-auth pages outside `HIDE_WIDGET_ON`.
- `Sidebar`: collapsible `w-60`↔`w-16`; `NAV_ITEMS` hardcoded (primary) + `SECONDARY_ITEMS` (Tetapan, all users) + `ADMIN_ITEM` (Pentadbiran) appended only when `useSession()` role is `admin`; footer shows name + role badge; active-route rule: `/` is active for `/cases/*` too; sign-out uses `signOut({ redirectTo: '/auth/login' })`. **Requires the `<SessionProvider>` from `Providers` (mounted in root layout) — without it `useSession()` returns null and the admin tab/role never show.**

## Providers (`src/components/providers/Providers.tsx`)
Props: `{ children; session: Session | null }` — `'use client'` wrapper around next-auth `<SessionProvider>`. Root layout (`src/app/layout.tsx`, now `async`) resolves `session` via `await auth()` and passes it in, so `useSession()` hydrates with no extra fetch.

## AdminPanel (`src/components/admin/AdminPanel.tsx`)
Props: `{ currentUserId: string }` (the logged-in admin's id — used to disable self-delete/self-demote rows). `'use client'`; rendered by the server-guarded `src/app/admin/page.tsx`.
- Three tabs: **Pengurusan Pengguna** (fetch `/api/admin/users`; add-user form, per-row role `<select>`, reset-password modal, delete with `confirm()`), **Chatbot** (`ChatbotTab` — edit bot name / welcome / starter questions / refusal + maintenance toggle via `PUT /api/admin/chatbot-settings`; avatar upload via `POST /api/admin/chatbot-settings/avatar`, preview from `/api/chatbot/avatar`), and **Sistem** (fetch `/api/admin/stats`; read-only metric cards). All mutations re-fetch the list. Self row: role select + delete disabled.
- Server enforces the real guards (403 + self/last-admin protection); the UI disables are cosmetic.

## SettingsTabs (`src/components/settings/SettingsTabs.tsx`)
Props: `{ name; email; role }` (all strings, server-resolved from the session). `'use client'`; rendered by `src/app/settings/page.tsx`.
- **Profil** tab: email + role read-only; editable display name → `PATCH /api/account/profile`, then `useSession().update({ name })` so the sidebar reflects it without re-login. **Security** tab: change password → `POST /api/auth/change-password` (client checks new==confirm; server verifies current).
