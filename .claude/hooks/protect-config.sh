#!/bin/bash
# PreToolUse hook (Write|Edit matcher): Guards critical config files.
# AGC2: protects env, Next config, auth middleware, DB pool, and linter/build configs.
#
# Exit code 0 with JSON = prompt user for confirmation before proceeding

PYTHON=$(command -v python3 2>/dev/null || command -v python 2>/dev/null)
if [ -z "$PYTHON" ]; then exit 0; fi

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | "$PYTHON" -c "import sys,json;d=json.load(sys.stdin);print(d.get('tool_input',{}).get('file_path',''))" 2>/dev/null)

# Normalize backslashes so Windows paths match
FILE_PATH=$(echo "$FILE_PATH" | tr '\\' '/')

# AGC2 critical files: env, Next config, root middleware + auth guards, pg pool
if echo "$FILE_PATH" | grep -qiE '(\.env(\.local|\.example)?$|next\.config\.(ts|js|mjs)|(^|/)middleware\.ts$|src/lib/supabase/middleware\.ts|src/lib/db\.ts|vercel\.json)'; then
  echo '{"decision": "ask", "reason": "This is a critical AGC2 file (env, Next config, auth middleware, or DB pool). Confirm this edit is intentional — mistakes here break auth or deployment for every route."}'
  exit 0
fi

# Standard linter/formatter/build configs
if echo "$FILE_PATH" | grep -qiE '(eslint\.config|\.eslintrc|prettier\.config|\.prettierrc|tsconfig|tailwind\.config|postcss\.config|\.npmrc)'; then
  echo '{"decision": "ask", "reason": "This is a linter/formatter/build config. Confirm this edit improves the config rather than weakening rules to suppress errors."}'
  exit 0
fi

exit 0
