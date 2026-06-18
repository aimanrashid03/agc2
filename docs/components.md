# Component Contracts — AGC2

Non-obvious prop contracts and behaviors. Update when a contract changes.

## CasesTableWrapper (`src/components/CasesTableWrapper.tsx`)
Props: `{ cases: Case[]; categories: {value,label}[]; states: string[] }`
- Owns multi-select state; renders a selection banner (count + `MultiCaseExportButton` + clear-X) when anything is selected.
- Passes `selectedCaseIds` + `onSelectedCasesChange` down to `CasesTable`.

## CasesTable (`src/components/CasesTable.tsx`)
Props: `{ cases, categories, states, selectedCaseIds?, onSelectedCasesChange? }`
- 11 columns incl. checkbox (40px), view icon, and per-row PDF download. Most columns are drag-resizable (min 40px); **widths are local state — lost on re-render, not persisted**.
- Filters: text search (file_no, case_name, okt_name), category, status, state. "Kes Dadah" is a special category: `source_folder` contains `39B` OR akta contains `DADAH`/`BERBAHAYA`.
- Status dropdown hardcodes exactly two values: `SELESAI`, `BELUM SELESAI`.
- Sort default: `file_open_date` desc; nulls sort to the end. Any filter change resets to page 1.
- Pagination: 10 (default) / 20 / 50 rows.
- Row click expands inline details; selection and expansion are independent.

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
