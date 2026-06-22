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
- Replaces literal `\n` escape sequences with real newlines; fixed 600px height with internal scroll.

## ChatInterface (`src/components/ChatInterface.tsx`)
- Message shape: `{ role: 'user' | 'assistant', content: string }`.
- Citation regex parses `[[Name]](id)` (primary) and `[Name](id)` (fallback) → links to `/cases/:id`. **Coupled to the system prompt in `src/app/api/chat/route.ts`** — change both together.
- Persists to `localStorage['chat_messages']`; clear button wipes state + storage.

## ExportPDFButton / MultiCaseExportButton
See [docs/pdf-export.md](pdf-export.md#frontend-buttons).

## AppShell / Sidebar (`src/components/layout/`)
- `AppShell`: hides sidebar entirely when `pathname.startsWith('/auth')`.
- `Sidebar`: collapsible `w-60`↔`w-16`; `NAV_ITEMS` hardcoded; active-route rule: `/` is active for `/cases/*` too; sign-out uses `window.location.href` (intentional hard reload).
