# Oh My Obsidian for Codex

This directory contains the Codex plugin surface for `oh-my-obsidian`. It is
isolated under `plugins/oh-my-obsidian/` so the existing Claude Code plugin
surface at the repository root stays intact.

## Install

Codex should use the repository marketplace file:

```text
.agents/plugins/marketplace.json
```

That marketplace resolves this plugin path inside the repository:

```text
./plugins/oh-my-obsidian
```

Do not point Codex at `.claude-plugin/marketplace.json`. That file remains for
Claude Code compatibility only.

### Plugin Management Flow

Add the marketplace from GitHub first:

```bash
codex plugin marketplace add hongdangmoo49/oh-my-obsidian
```

Then open Codex, run `/plugins`, and install `oh-my-obsidian` from that
marketplace entry.

The documented Codex-native path for this repository is the `.agents` marketplace
entry, not the legacy Claude marketplace entry.

### Local Development Path

For local development, add the checked-out repository itself as the marketplace
source:

```bash
codex plugin marketplace add /path/to/oh-my-obsidian
```

## Start

Ask Codex:

```text
Set up an Obsidian vault for this project.
```

Common follow-up prompts:

```text
What did we decide last time about the deployment notes?
Save this session to the Obsidian vault.
Show me the vault health check.
Add a note to the vault for today's API decisions.
Restore my past Codex sessions to the vault.
$oh-my-obsidian-vault-manager Show me the vault health check.
$oh-my-obsidian-restore-history
```

The setup skill performs:

1. Obsidian desktop preflight
2. project interview
3. vault structure proposal
4. dry-run summary
5. setup-state bootstrap and managed artifact writes
6. optional Obsidian Git choice
7. validation
8. official Codex hooks setup
9. optional Codex session history restore

## Included Surfaces

- `skills/`: setup, recall, session-save, vault-manager, and restore-history
  skills for Codex.
- `restore-history`: scans `~/.codex/sessions/` (or `$CODEX_HOME/sessions/`)
  for past Codex rollout JSONL files, parses user messages and tool usage,
  and writes structured Markdown session notes to the vault.
- `vault-manager`: supports list, add, organize-plan/apply, and health-check
  flows for an attached vault.
- `scripts/`: plugin-local helpers for setup, vault operations, Codex history
  restore, Obsidian app preflight, Obsidian Git setup, and official Codex hooks
  planning.
- `templates/`: reserved for vault and onboarding templates.
- `hooks/`: cross-platform Node hook runner for official Codex hooks.
- `hooks-preview/`: legacy Stop-hook preview template kept for compatibility.
- `config-snippets/`: hook and feature-flag configuration snippets with
  install-time path placeholders.
- `tests/`: plugin-local fixture tests for setup, vault ops, Obsidian Git, and
  Codex hooks behavior.

## Official Codex Hooks

Hooks are not enabled by the manifest or without approval. The setup flow can
install official Codex hooks after vault validation.

Recommended project-local plan:

```bash
node plugins/oh-my-obsidian/scripts/codex-hooks.mjs plan --mode repo-local --repo-root . --vault "$OBSIDIAN_VAULT"
```

Apply after explicit approval:

```bash
node plugins/oh-my-obsidian/scripts/codex-hooks.mjs apply --mode repo-local --repo-root . --vault "$OBSIDIAN_VAULT"
```

Install modes:

- `repo-local` (recommended): installs under `<repo>/.codex/` and stores the
  approved vault pointer in `<repo>/.codex/oh-my-obsidian.local.json`.
- `user-global`: installs under `~/.codex/` for advanced users who explicitly
  want the hook dispatcher available outside one project.

`repo-local` accepts any directory inside the Git worktree and normalizes it to
the Git root before writing `<repo>/.codex/`. It also creates or updates
`<repo>/.codex/.gitignore` so the personal vault pointer is not committed.

The installer keeps responsibilities separate: `config.toml` enables
`[features].codex_hooks = true`, while `hooks.json` stores the `SessionStart`
and `Stop` command hooks. `SessionStart` injects compact project/vault context;
`Stop` reminds Codex to save important session decisions. Existing hooks are
preserved, invalid config files fail safely, duplicate commands are avoided, and
the output includes rollback plus skip guidance.

For first-time setup, repo-local hooks can finish the beginner path when vault
files are already created but Codex has no resolver yet. In that case the
project-local pointer becomes the resolver, so users do not need to understand
`OBSIDIAN_VAULT` or global config pointers.

Last step: allow Codex to use this project's local `.codex/` settings when it
asks. This connects the current project to the approved Obsidian vault, and the
personal vault path stays protected from Git commits.

If automatic memory does not appear in a new Codex session:

1. Confirm that Codex was allowed to use this project's `.codex/` settings.
2. Start a new Codex session from the project directory.
3. Ask `Show me the vault health check.`

To remove repo-local hooks, delete `<repo>/.codex/hooks/oh-my-obsidian/`, remove
the oh-my-obsidian `SessionStart` and `Stop` entries from
`<repo>/.codex/hooks.json`, and delete
`<repo>/.codex/oh-my-obsidian.local.json`. Remove `codex_hooks = true` from
`<repo>/.codex/config.toml` only if no other hook setup uses it.

## Safety Boundaries

Separate approval is required before:

- package-manager installs for Obsidian desktop
- shell profile mutation for `OBSIDIAN_VAULT`
- creation of `~/.oh-my-obsidian/config.json`
- third-party Obsidian Git downloads
- community plugin enablement
- auto-sync or team-sync behavior
- git remote changes or push operations
- file overwrites, moves, deletes, or reconcile actions
- official Codex hooks installation or `.codex/*` edits

Follow-up skills resolve the vault through explicit `OBSIDIAN_VAULT` first,
then approved Codex hook pointers (`<repo>/.codex/oh-my-obsidian.local.json`
and `~/.codex/oh-my-obsidian.local.json`), then the optional approved pointer
at `~/.oh-my-obsidian/config.json`.
