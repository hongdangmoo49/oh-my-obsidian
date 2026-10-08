---
description: "Enable quiet automatic summaries and safely migrate the old PR #9 SessionEnd hook"
allowed-tools: Bash, Read, Write
---

## Context
The plugin bundles SessionStart/UserPromptSubmit guidance and quiet Stop receipt verification.
Do not launch another Claude process from SessionEnd. Automatic summaries are saved
inside the current conversation before its final response using the shared safe helper.

## Your Task

1. Resolve the existing vault and run the migration plan:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/claude-auto-save.mjs" plan --vault "<vault>"
```

2. If the old vault has no setup-state, explain metadata-only attachment (no Markdown
changes) and request explicit approval before adding `--attach-legacy` to plan/apply.
3. Show the removed legacy callback count and the approved pointer change. Ask for
approval, then run the same helper with `apply` instead of `plan`.
4. Invalid settings JSON must stop migration, never be replaced with an empty object.
Other hooks/settings are preserved. The original settings are backed up before removal.
5. Reload the plugin or start a new session. Do not claim saves survive a forcibly
closed terminal. Quiet saving is best effort; missing completion is reported briefly.
6. To disable, plan/apply with `--disable`; do not disable unrelated plugins/hooks.
