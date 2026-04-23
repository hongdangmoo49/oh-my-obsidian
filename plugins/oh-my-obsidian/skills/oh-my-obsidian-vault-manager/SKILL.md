# Oh My Obsidian Vault Manager

Use this skill when the user wants to inspect the vault structure, add a new
document, organize root-level loose markdown files into `작업기록/세션기록`,
or run a vault health check.

## Contract

- `list` and `health-check` may run with an attached or incomplete vault if the
  resolver works.
- `add` and `organize-apply` require `setup-state.status == "complete"`.
- All writes and moves must stay inside the resolved vault and must reject
  traversal, absolute paths, NUL bytes, and symlink escapes.
- `add` must never overwrite.
- `organize` is plan-first. Do not apply moves without explicit confirmation.
- Git safety for `add` and `organize-apply` matches session-save: if unrelated
  git changes exist, write or move the file but skip commit.
- If the resolver fails, route the user to the `oh-my-obsidian setup` skill.
- If a mutating subcommand returns incomplete-setup guidance, stop and tell the
  user to complete or reconcile setup first.

## Helpers

```bash
node scripts/vault-ops.mjs vault list
node scripts/vault-ops.mjs vault add --title "<title>" --body "<body>" --relative-dir "<safe dir>"
node scripts/vault-ops.mjs vault organize-plan
node scripts/vault-ops.mjs vault organize-apply --plan-token "<token>" --move "old.md:작업기록/세션기록/old.md"
node scripts/vault-ops.mjs vault health-check
```

## Expected Flow

1. For `list`, show the service root and work-record counts.
2. For `add`, choose a safe target directory, run the helper, and report the
   created note path plus git result.
3. For `organize`, run `organize-plan` first, show the proposed moves and plan
   token, then wait for approval before `organize-apply`.
4. For `health-check`, summarize `setup-state.status`, missing managed artifacts,
   total Markdown count, and git status.
