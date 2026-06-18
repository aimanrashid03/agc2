---
name: pdf-export
description: Use when working on PDF generation or export — laporanPdfGenerator, trendOfSentencingPdfGenerator, the export-pdf / export-trend-pdf API routes, ExportPDFButton, MultiCaseExportButton, pdfkit, svg-to-pdfkit.
---

# PDF Export Work — AGC2

## Before writing any code (mandatory pre-flight)
1. Read [docs/pdf-export.md](../../../docs/pdf-export.md) — both pipelines, layout constants, sharp edges.
2. Read the generator you're changing in full — both are layout-sensitive; a constant tweak in one section shifts everything below it.
3. Note which PDF you're in: single-case **Laporan** (portrait A4) vs multi-case **Trend of Sentencing** (landscape A4). They intentionally differ in date format (`dd/mm/yyyy` vs `dd.mm.yyyy`) and empty fallback (`-` vs `tiada data`) — do NOT unify them.

## Pinned numbers (do not drift)
- Laporan: A4 portrait, margins 56/60/60/72 pt, label column 140pt, logo 62×62pt from `templates/Jata_MalaysiaV2.svg`.
- Trend: landscape A4 (841.89 × 595.28 pt), 10pt margins, 9pt font, header bg `#D0CECE`, row height 18pt, column widths 25/111/228/152/152/152 pt.
- Trend route hard limit: **100 cases per request**.

## Hard rules
- Both API routes keep `export const runtime = 'nodejs'` — pdfkit and pg do not run on Edge.
- Generators return `Promise<Buffer>` built from pdfkit's `'data'` events — keep that contract; routes wrap it in a Response with `Content-Disposition: attachment`.
- Only built-in Helvetica fonts are available — don't reference custom fonts without registering them (and flag the bundle-size cost first).
- The Jata SVG is cached in a module-level variable and silently skipped if missing — preserve the graceful fallback (PDF without logo beats a 500).
- People are matched to PDF roles by keyword filters on role/category (`defendan`, `tertuduh`, `accused`, `respondent`; judges via `corum`/`hakim`) with `raw_data` fallbacks — when fields come out empty, check the keyword filters and nested `raw_data` paths before assuming missing data.
- Use `?debug=1` on the single-case route to get the JSON field audit instead of a PDF — verify extraction there before debugging layout.

## After the change (mandatory verification)
1. `npm run build` — zero errors.
2. Generate a real PDF: hit the route in the dev server (or `curl` it) with a seeded case and OPEN the file — check page breaks, header on continuation pages (Trend), and page numbering (Laporan).
3. If you changed layout constants, test with a long-content case (long `grounds_of_judgement`) to exercise wrapping and pagination.

## Common mistakes
- Testing only with short content → wrapping/pagination bugs ship unseen.
- "Fixing" the date-format inconsistency between the two PDFs → they mirror different official templates.
- Removing the SVG silent-fallback → export 500s on environments missing `templates/`.
- Forgetting connection release on new early-return paths → pg pool exhaustion under load.
