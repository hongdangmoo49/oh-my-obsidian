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
$oh-my-obsidian-vault-manager Show me the vault health check.
```

The setup skill performs:

1. Obsidian desktop preflight
2. project interview
3. vault structure proposal
4. dry-run summary
5. setup-state bootstrap and managed artifact writes
6. optional Obsidian Git choice
7. validation

## Included Surfaces

- `skills/`: setup, recall, session-save, and vault-manager skills for Codex.
- `vault-manager`: supports list, add, organize-plan/apply, and health-check
  flows for an attached vault.
- `scripts/`: plugin-local helpers for setup, vault operations, Obsidian app
  preflight, Obsidian Git setup, and hook preview merge planning.
- `templates/`: reserved for vault and onboarding templates.
- `hooks-preview/`: optional Stop-hook preview template only.
- `config-snippets/`: hook configuration snippet with an install-time path
  placeholder.
- `tests/`: plugin-local fixture tests for setup, vault ops, Obsidian Git, and
  hook preview behavior.

## Hook Preview Opt-In

Hooks are not enabled by the manifest.

Preview the merge and install paths:

```bash
node plugins/oh-my-obsidian/scripts/hook-preview.mjs plan --scope home
```

Apply after explicit approval:

```bash
node plugins/oh-my-obsidian/scripts/hook-preview.mjs apply --scope home
```

Available scopes:

- `home`: installs to `~/.codex/hooks/oh-my-obsidian/`
- `repo`: installs to `<repo>/.codex/hooks/oh-my-obsidian/`

The helper preserves existing Stop hooks, blocks invalid `hooks.json`, avoids
duplicate insertion, and returns rollback plus skip guidance.

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
- hook preview installation or `hooks.json` edits

Follow-up skills resolve the vault through `OBSIDIAN_VAULT` first, then the
optional approved pointer at `~/.oh-my-obsidian/config.json`.
