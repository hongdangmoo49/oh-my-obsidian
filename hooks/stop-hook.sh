#!/usr/bin/env bash
# oh-my-obsidian stop hook
# Prompts user to save session context to vault before session ends

# Compatibility entry point for old settings. New installs use Node directly.
ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
exec node "$ROOT/plugins/oh-my-obsidian/hooks/codex-hook-runner.mjs" stop --claude
