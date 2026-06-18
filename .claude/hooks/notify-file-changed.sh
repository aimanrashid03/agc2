#!/bin/bash
# PostToolUse hook (Write|Edit matcher): Injects a verify reminder after source edits.
# AGC2: covers Next.js/React TS source, pipeline scripts, and the Python cleaner.
# Excludes test files and generated files.

PYTHON=$(command -v python3 2>/dev/null || command -v python 2>/dev/null)
if [ -z "$PYTHON" ]; then exit 0; fi

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | "$PYTHON" -c "import sys,json;d=json.load(sys.stdin);print(d.get('tool_input',{}).get('file_path',''))" 2>/dev/null)
FILE_PATH=$(echo "$FILE_PATH" | tr '\\' '/')

if echo "$FILE_PATH" | grep -qE '\.(ts|tsx|py)$'; then
  # Exclude tests, generated, and declaration files
  if echo "$FILE_PATH" | grep -qE '(\.test\.|\.spec\.|/__tests__/|next-env\.d\.ts|\.tsbuildinfo)'; then
    exit 0
  fi

  # Pipeline scripts (seed/ingest/setup)
  if echo "$FILE_PATH" | grep -qE '(^|/)scripts/'; then
    echo '{"systemMessage": "Pipeline script modified. Verify: confirm which DATABASE_URL it targets, run it against local/dev data first, and check counts with scripts/count-cases.ts or check-embeddings.ts. Remember: re-seeding invalidates case_embeddings."}'
    exit 0
  fi

  # RAG chat route — citation/threshold coupling
  if echo "$FILE_PATH" | grep -qE 'src/app/api/chat/route\.ts'; then
    echo '{"systemMessage": "RAG chat route modified. Verify: citation format [[Name]](id) still matches the ChatInterface.tsx regex, threshold/count/model match docs/rag-chat.md, runtime stays nodejs. Run npm run build and a retrieval smoke test (npx tsx scripts/test-retrieval.ts)."}'
    exit 0
  fi

  # PDF generators
  if echo "$FILE_PATH" | grep -qE '(laporanPdfGenerator|trendOfSentencingPdfGenerator)\.ts'; then
    echo '{"systemMessage": "PDF generator modified. Verify: npm run build, then generate a real PDF from the dev server and open it — check wrapping, pagination, and continuation-page headers. Use ?debug=1 on the single-case route to audit field extraction."}'
    exit 0
  fi

  # General frontend/server source
  echo '{"systemMessage": "Source file modified. Verify before declaring done: run npm run build (must pass with zero errors) and re-read the edited file to confirm the change landed correctly."}'
fi

exit 0
