# PDF Export — AGC2

Two export paths, both `runtime = 'nodejs'` (pdfkit + pg require Node, not Edge), both fetching via the `pg` pool.

## 1. Single-case "Laporan" PDF
- Route: `GET /api/cases/[id]/export-pdf` (`src/app/api/cases/[id]/export-pdf/route.ts`)
  - Queries `cases` (all columns), `people` (ordered by role desc), `allegations` (ordered by id).
  - `?debug=1` returns a JSON field audit instead of the PDF — use this to verify data extraction.
  - Response filename: `Laporan_<file_no>_<timestamp>.pdf`.
- Generator: `src/lib/laporanPdfGenerator.ts` → `generateLaporanPdf(caseData): Promise<Buffer>`
  - Portrait A4; margins top 56 / left 60 / right 60 / bottom 72 pt; Helvetica family only (no custom fonts registered).
  - Header: Jata Negara logo from `templates/Jata_MalaysiaV2.svg` rendered via `svg-to-pdfkit` (62×62pt), **cached in a module-level variable**; if the file is missing it silently continues without the logo.
  - Sections (Malay labels): Korum, Pendakwaan, Responden, Pertuduhan, Keputusan, Tarikh Keputusan, Tarikh Fail Rayuan, Tarikh Hantar ANT, Alasan Penghakiman, Latar Belakang dan Fakta Kes, Isu dan Hujahan, Cadangan TPR, Cadangan PPN, Tutup Fail.
  - Label column width 140pt; long values wrapped with a binary-search line-fitting helper (`splitTextToFit`).
  - Extraction helpers (`buildPerayu`, `buildResponden`, `buildKorum`, `buildPertuduhan`, `buildTutupFail`, `formatPartyBlock`) filter `people` by role/category keywords and fall back to nested `raw_data` paths (e.g. `LTL_DATA.namaPerayuResponden`).
  - Page numbers `n/total` added at the end via `doc.bufferedPageRange()`.
  - Dates: `dd/mm/yyyy`, empty fallback `-`.

## 2. Multi-case "Trend of Sentencing" PDF
- Route: `POST /api/cases/export-trend-pdf` with body `{ caseIds: number[] }`
  - Validates non-empty; **hard limit 100 cases per request**.
  - Bulk parameterized queries for cases/people/allegations; filename `LaporanPelbagaiKes_<ISO timestamp>.pdf`.
- Generator: `src/lib/trendOfSentencingPdfGenerator.ts` → `generateTrendOfSentencingPdf(cases): Promise<Buffer>` (class-based `PDFGenerator`)
  - **Landscape A4** (841.89 × 595.28 pt), 10pt margins, 9pt body font.
  - Columns (pt): No 25, No Kes MR 111, Pihak-Pihak 228, Mahkamah Tinggi 152, Mahkamah Rayuan 152, Mahkamah Persekutuan 152.
  - Header row background `#D0CECE`; row height 18pt; 0.5pt borders; black 8pt separator rows; header redrawn on each new page.
  - Accused matched by role/category keywords (`defendan`, `tertuduh`, `accused`, `respondent`); judges by category `corum` or role containing `hakim`; sections comma-joined from allegations.
  - Dates: `dd.mm.yyyy` (dot separator — intentionally different from the single-case PDF), empty fallback `tiada data`.

## Frontend buttons
- `ExportPDFButton` (`caseId`, `fileName`, optional `size`/`variant`): fetches the single-case route, downloads blob as `Laporan_<fileName>_<YYYY-MM-DD>.pdf`; Malay alert on failure.
- `MultiCaseExportButton` (`selectedCaseIds: number[]`): POSTs to the trend route; label shows count ("Laporan (3)"); disabled when empty.
- Selection state lives in `CasesTableWrapper` (see docs/components.md).

## Known sharp edges
- Both routes `pool.connect()` → `.release()` without try/finally — an error mid-generation can leak a connection.
- Only built-in PDFKit fonts: non-Latin glyphs depend on reader font substitution.
- The two generators format dates and empty values differently (by design of the source templates) — don't "unify" without checking the template owners.

> Maintenance: changes to layout constants, columns, or section lists must be reflected here.
