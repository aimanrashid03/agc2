#!/bin/bash
# PreToolUse hook (Bash matcher): Blocks force-push; prompts confirmation for any git push.
# AGC2: CLAUDE.md prohibits force-push and unsolicited pushes.
#
# Exit code 2 = deny (blocks the command)
# Exit code 0 = allow (or output {"decision":"ask",...} for confirmation prompt)

PYTHON=$(command -v python3 2>/dev/null || command -v python 2>/dev/null)
if [ -z "$PYTHON" ]; then
  echo "block-git-push: python not found -- hook cannot parse input" >&2
  exit 0
fi

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | "$PYTHON" -c "import sys,json;d=json.load(sys.stdin);print(d.get('tool_input',{}).get('command',''))" 2>/dev/null)

# Only intercept git push commands
if ! echo "$COMMAND" | grep -qE 'git push'; then
  exit 0
fi

# Hard block: force-push is prohibited (CLAUDE.md rule)
if echo "$COMMAND" | grep -qE 'git push.*(--force|-f)'; then
  echo "Blocked: force-push is prohibited by CLAUDE.md. Ask the user explicitly if a force-push is truly needed." >&2
  exit 2
fi

# Soft block: ask for confirmation on any regular push
echo '{"decision": "ask", "reason": "About to push to remote. CLAUDE.md says do not push unless the user explicitly asked. Confirm the user requested this push."}'
exit 0
