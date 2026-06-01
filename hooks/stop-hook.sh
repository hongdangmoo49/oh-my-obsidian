#!/usr/bin/env bash
# oh-my-obsidian stop hook
# Prompts user to save session context to vault before session ends

VAULT="${OBSIDIAN_VAULT:-}"

# If vault is not configured, exit silently
if [ -z "$VAULT" ] || [ ! -d "$VAULT" ]; then
  exit 0
fi

# Output system message that Claude will see (Stop hooks don't support hookSpecificOutput)
cat <<'EOF'
{"systemMessage":"💡 이번 세션 작업을 Obsidian 볼트에 기록하려면 '기록해줘'라고 말하세요. (건너뛰기: session-save skip)"}
EOF
