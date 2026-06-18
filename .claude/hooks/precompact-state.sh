#!/bin/bash
# Hook: PreCompact (sync) — State Serialization
# Writes a JSON snapshot of current working state before context compaction.
# State is saved to ~/.claude/precompact-state.json for recovery in next session.
#
# Exit code: always 0 (never blocks compaction)

PYTHON=$(command -v python3 2>/dev/null || command -v python 2>/dev/null)
if [ -z "$PYTHON" ]; then
  echo "precompact-state: python not found -- state not saved" >&2
  exit 0
fi

STATE_FILE="$HOME/.claude/precompact-state.json"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
PLAN_FILE=$(ls -t "$HOME/.claude/plans/"*.md 2>/dev/null | head -1)
[ -z "$PLAN_FILE" ] && PLAN_FILE="none"
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
CWD=$(pwd)

export STATE_FILE TIMESTAMP PLAN_FILE BRANCH CWD

"$PYTHON" -c "import os,json;f=os.environ['STATE_FILE'];d={'timestamp':os.environ['TIMESTAMP'],'plan':os.environ['PLAN_FILE'],'branch':os.environ['BRANCH'],'cwd':os.environ['CWD']};open(f,'w').write(json.dumps(d))" 2>/dev/null

exit 0
