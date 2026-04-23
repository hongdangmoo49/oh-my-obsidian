# Oh My Obsidian for Codex

This directory contains the Codex plugin surface for `oh-my-obsidian`. It is
isolated under `plugins/oh-my-obsidian/` so the existing Claude Code plugin
surface at the repository root stays intact.

## Install

Codex should use the repository marketplace file:

```text
.agents/plugins/marketplace.json
```

That marketplace resolves this local plugin path:

```text
./plugins/oh-my-obsidian
```

Do not point Codex at `.claude-plugin/marketplace.json`. That file remains for
Claude Code compatibility only.

### `/plugins` Flow

Open Codex plugin management, then either:

1. add the local marketplace rooted at this repository, or
2. install the local plugin directly from `./plugins/oh-my-obsidian`.

The documented Codex-native path for this repository is the `.agents` marketplace
entry, not the legacy Claude marketplace entry.

### Sparse / Local Marketplace Path

For a sparse checkout or other local Codex workflow, keep the `.agents`
directory plus `plugins/oh-my-obsidian/` available in the working tree, then
point Codex at the repository-local `.agents/plugins/marketplace.json`. The
marketplace entry resolves the plugin by the local relative path
`./plugins/oh-my-obsidian`.

## Start

Ask Codex:

```text
Set up an Obsidian vault for this project.
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
