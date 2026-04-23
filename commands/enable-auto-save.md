---
description: "Enable automatic session save on exit (Registers SessionEnd hook)"
allowed-tools: Bash, Read, Write
---

## Context
This command registers the `SessionEnd` lifecycle hook in the user's Claude Code configuration so that `/oh-my-obsidian:session-save` runs automatically whenever the Claude Code session ends. This is specifically useful for existing users who already ran `/oh-my-obsidian:setup` before the auto-hook feature was introduced, or if a user accidentally wiped their `.claude` configuration directory.

## Your Task

Execute the following Bash script to safely inject the hook into `~/.claude/settings.json`.

```bash
CONFIG_FILE=~/.claude/settings.json
mkdir -p "$(dirname "$CONFIG_FILE")"
[ -f "$CONFIG_FILE" ] || echo "{}" > "$CONFIG_FILE"

# Add SessionEnd hook using jq
jq --arg cmd "claude -p '/oh-my-obsidian:session-save'" '
  .hooks.SessionEnd = (
    (.hooks.SessionEnd // []) |
    map(select(.hooks[0].command != $cmd)) +
    [{ "matcher": "", "hooks": [{ "type": "command", "command": $cmd }] }]
  )
' "$CONFIG_FILE" > "$CONFIG_FILE.tmp" && mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
```

After executing the script successfully, print the following Korean success message:

```text
🎉 자동 저장 훅(SessionEnd Hook)이 성공적으로 등록되었습니다!

이제 실수로 터미널을 그냥 끄더라도, oh-my-obsidian이 백그라운드에서 현재 세션의 작업 내역과 의사결정 사항들을 옵시디언 볼트에 안전하게 자동 저장합니다. 코딩에만 집중하세요!
```
