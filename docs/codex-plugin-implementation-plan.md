# Codex Plugin Implementation Plan

## Goal

Ship oh-my-obsidian as a Codex Plugin while preserving the existing Claude Code
plugin behavior. The Codex implementation must keep the product's core UX:
a guided setup flow that walks users through vault creation, Obsidian readiness,
and optional Obsidian Git setup.

Existing Claude plugin files are preservation targets. Codex support is added as
a parallel plugin surface, not by rewriting the Claude surface.

## Phase 0. Baseline And Constraints

- Preserve the existing Claude runtime surface:
  - `.claude-plugin/*`
  - `commands/*`
  - `agents/*`
  - `hooks/*`
  - root `skills/*`
  - `bin/*`
  - root `scripts/*`
  - existing script tests
- Do not use the repository root as the Codex plugin root. The root contains
  Claude-specific `skills/`, `commands/`, `agents/`, and `.mcp.json` that can
  collide with Codex default plugin discovery.
- Use `plugins/oh-my-obsidian/` as the isolated Codex plugin root.
- Keep `.claude-plugin/marketplace.json` unchanged. Codex can read
  `.agents/plugins/marketplace.json` first and may also read the Claude legacy
  marketplace, but Codex install docs must rely on the `.agents` marketplace
  and must not depend on the legacy Claude entry.
- Limit Codex v1 to stable plugin surfaces:
  - `.codex-plugin/plugin.json`
  - `skills/`
  - plugin-local `scripts/`, `templates/`, and optional `assets/`
- Defer `.mcp.json` and `.app.json` until a later extension.
- Treat the guided setup skill as Codex v1's core feature. A plugin that only
  ports recall/session-save/vault-manager is not enough.
- Port helper scripts into the Codex plugin. Do not depend on root scripts,
  `PATH` shims, `bin/`, `CLAUDE_PLUGIN_ROOT`, or `TOOLDI_VAULT`.
- Hooks are preview-only and opt-in. Do not add hooks to the Codex plugin
  manifest.

## Phase 1. Codex Plugin Scaffold

- Add plugin root: `plugins/oh-my-obsidian/`.
- Keep plugin identity consistent:
  - folder name: `oh-my-obsidian`
  - `.codex-plugin/plugin.json` `name`: `oh-my-obsidian`
  - `.agents/plugins/marketplace.json` `plugins[].name`: `oh-my-obsidian`
- Add this structure:

```text
plugins/oh-my-obsidian/
  .codex-plugin/plugin.json
  README.md
  skills/
  scripts/
  templates/
  assets/                 # optional
  hooks-preview/
  config-snippets/
  tests/
```

- `plugin.json` must include:
  - `name`
  - `version`
  - `description`
  - `author`
  - `homepage`
  - `repository`
  - `license`
  - `keywords`
  - `skills: "./skills/"`
  - `interface.displayName`
  - `interface.shortDescription`
  - `interface.longDescription`
  - `interface.developerName`
  - `interface.category`
  - `interface.capabilities`
  - `interface.websiteURL`
  - `interface.privacyPolicyURL`
  - `interface.termsOfServiceURL`
  - `interface.defaultPrompt`
- `interface.defaultPrompt` must contain 1-3 user-facing starter prompt
  strings, each 128 characters or fewer. These are not skill IDs.
- Add native Codex marketplace file:

```json
{
  "name": "omob-codex",
  "interface": {
    "displayName": "Oh My Obsidian Codex"
  },
  "plugins": [
    {
      "name": "oh-my-obsidian",
      "source": {
        "source": "local",
        "path": "./plugins/oh-my-obsidian"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
```

- Document that Codex users should install through the `.agents` marketplace
  path. The Claude marketplace remains for Claude Code only.

## Phase 2. Guided Setup Skill MVP

- Add setup skill:

```text
plugins/oh-my-obsidian/skills/oh-my-obsidian-setup/SKILL.md
```

- Define `vaultRoot` as the setup-selected vault directory.
- During setup, use `vaultRoot` before any environment mutation.
- Codex vault resolver contract:
  - Resolve `OBSIDIAN_VAULT` first.
  - If absent, resolve `~/.oh-my-obsidian/config.json` `vaultPath`, but only
    if setup created that pointer after explicit user approval.
  - Resolve the candidate vault path realpath.
  - Read `<candidate>/.oh-my-obsidian/setup-state.json`.
  - Validate the candidate realpath against setup-state `vaultRealPath`.
  - If no resolver works, setup state is `action_required_env`; mutating skills
    must stop and show setup/env instructions.
- Setup flow:
  - preflight
  - project interview
  - structure proposal
  - dry-run summary
  - explicit create confirmation
  - bootstrap exception: create only `vaultRoot` and `vaultRoot/.oh-my-obsidian`
    before setup-state exists
  - atomic `in_progress` setup-state write before first mutation
  - planned `managedArtifacts` write before first mutation
  - vault construction
  - atomic `managedArtifacts` update after each mutation
  - Obsidian Git choice
  - validation
  - success or action-required summary
- Setup-state path is always:

```text
vaultRoot/.oh-my-obsidian/setup-state.json
```

- Setup-state schema must include:
  - `schema`
  - `status`: `in_progress | complete | failed | action_required_env`
  - `pluginVersion`
  - `createdAt`
  - `updatedAt`
  - `projectName`
  - `vaultPath`
  - `vaultRealPath`
  - `knowledgeDomains`
  - `preflight`
  - `envVar`
  - `codexConfigPointer`
  - `git`
  - `obsidianGit`
  - `hookPreview`
  - `managedArtifacts[]`
- Each `managedArtifacts[]` entry must include:
  - `relativePath`
  - `kind`: `dir | file | config`
  - `source` or `template`
  - `planned`
  - `applied`
  - `checksum` or `contentHash` when applicable
  - `lastAppliedAt`
- Completion condition:
  - `vaultRoot` exists.
  - setup-state validates.
  - managed artifacts are applied or reconciled.
  - vault resolver works in the current Codex context via `OBSIDIAN_VAULT` or
    approved config pointer.
  - If the user declines shell profile mutation and config pointer creation,
    the setup cannot be marked `complete`; it must be `action_required_env`.
- Re-run UX:
  - No overwrite flow.
  - Offer `attach existing vault`, `resume incomplete setup`, or
    `reconcile missing managed artifacts`.
  - Deletions, moves, overwrites, shell profile mutation, and `.obsidian`
    changes require diff/dry-run and separate confirmation.
- Port interviewer/architect guidance into Codex-safe references under:

```text
plugins/oh-my-obsidian/skills/oh-my-obsidian-setup/references/
```

- Do not copy Claude agent files verbatim. Remove Claude frontmatter, Claude
  tool names, `AskUserQuestion`, `Agent(`, and `${CLAUDE_PLUGIN_ROOT}`.
- Do not depend on custom Codex agent installation. Include a single-agent
  fallback.
- Port helper scripts into `plugins/oh-my-obsidian/scripts/`.
  - No `CLAUDE_PLUGIN_ROOT`.
  - No `TOOLDI_VAULT`.
  - No `PATH`/`bin` dependency.
  - Use `import.meta.url` or script-relative paths.
- Preflight safety:
  - Docker/container: never auto-install desktop Obsidian.
  - WSL: never install Linux GUI Obsidian; Windows host
    `powershell.exe`/`winget` check or install is allowed only after explicit
    confirmation.
  - Native Linux/macOS/Windows checks should preserve the existing helper's
    behavior.
- Separate approvals are required for:
  - package manager installs
  - shell profile mutation
  - `~/.oh-my-obsidian/config.json` pointer creation
  - third-party Obsidian Git download
  - community plugin enablement
  - auto-sync/team-sync
- If team-sync is blocked, do not run `git remote add` or `git push`
  automatically. Show commands or offer safe/manual fallback.

## Phase 3. Core Codex Skills

Add these skills:

```text
plugins/oh-my-obsidian/skills/oh-my-obsidian-recall/SKILL.md
plugins/oh-my-obsidian/skills/oh-my-obsidian-session-save/SKILL.md
plugins/oh-my-obsidian/skills/oh-my-obsidian-vault-manager/SKILL.md
```

- All write/move/commit skills must use the vault resolver contract and
  validate `vaultRoot` realpath against setup-state `vaultRealPath`.
- All vault-relative write targets must pass path safety validation:
  - reject absolute paths
  - reject `..`
  - reject NUL bytes
  - resolve write parent realpath before writing
  - require parent realpath to remain inside `vaultRoot`
  - reject symlink escape outside the vault
  - never overwrite unless the artifact is managed and reconciliation is
    explicitly confirmed
- Recall:
  - setup-state-aware Markdown search
  - exclude `.git` and `.obsidian`
  - return relevant excerpts
  - no mutation
- Session save:
  - exclusive create or collision suffix
  - never overwrite
  - git order:
    - inspect existing git status and index first
    - if unrelated staged/dirty/ambiguous state exists, create the note but
      skip staging/commit and report the path
    - only when safe, stage exactly the new file and commit it
    - verify index after commit
- Vault manager:
  - `list`
  - `add`
  - `organize`
  - `health-check`
  - `add` and `organize` use the same path safety and git safety policies as
    session-save
  - `organize` is plan-first and requires explicit confirmation
- Missing resolver/setup-state guidance must point users to the
  oh-my-obsidian setup skill, not a Claude slash command.

## Phase 4. Hooks Preview

- Provide templates only:

```text
plugins/oh-my-obsidian/hooks-preview/stop-save-reminder.sh
plugins/oh-my-obsidian/config-snippets/hooks.json
```

- Do not assume plugin-local hooks auto-run.
- Setup opt-in must:
  - check Codex version and docs-required feature state
  - apply feature/config changes only if required
  - show a diff
  - require explicit confirmation
- Opt-in installs hook script to one of:
  - `~/.codex/hooks/oh-my-obsidian/`
  - repo `.codex/hooks/oh-my-obsidian/`
- `hooks.json` must use an absolute path or git-root-based command, not a
  plugin cache-relative command.
- Existing hooks config must be merge-preserved:
  - no overwrite
  - no duplicate insertion
  - preserve existing Stop hooks
  - show diff before approval
  - document rollback/skip
- Hook script constraints:
  - no-op without vault resolver/setup-state
  - timeout 5 seconds or less
  - no file write
  - no network
  - no git
  - stdout is valid JSON envelope only, for example:

```json
{"continue": true, "systemMessage": "Save this session to Obsidian with oh-my-obsidian session-save when useful."}
```

- Windows is unsupported for hooks preview; do not install hooks there.

## Phase 5. Documentation

- Add `plugins/oh-my-obsidian/README.md` with:
  - Codex install flow
  - `/plugins` flow
  - setup skill invocation
  - sparse/local marketplace path
  - hook preview opt-in
- Update root `README.md` and `README.ko.md` with a Codex section without
  breaking the existing Claude install path.
- Add a feature matrix:
  - Claude Code plugin
  - Codex v1
  - Codex hooks preview
- Document security/permission boundaries:
  - package manager installs
  - shell profile mutation
  - config pointer creation
  - third-party downloads
  - community plugin enablement
  - git operations
  - auto-sync/team-sync

## Phase 6. Verification

- Manifest and marketplace validation:
  - required `plugin.json` fields
  - path existence
  - `defaultPrompt` count and length
  - `.agents/plugins/marketplace.json` `policy`, `source`, and `category`
    shape
- Forbidden pattern validation in `plugins/oh-my-obsidian` and
  `.agents/plugins`:
  - `CLAUDE_PLUGIN_ROOT`
  - `TOOLDI_VAULT`
  - `AskUserQuestion`
  - `${CLAUDE_PLUGIN_ROOT}`
  - `allowed-tools`
  - `argument-hint`
  - `Agent(`
  - Claude slash command references
  - Claude tool-name frontmatter
  - Claude command wrapper syntax
- Plugin root isolation test:
  - cache-like temp copy of `plugins/oh-my-obsidian`
  - no root Claude `skills`, `commands`, `agents`, or `hooks`
  - only plugin-local skills load
- Plugin-local script tests:
  - `node --check`
  - `bash -n`
  - PowerShell parser when available
  - preflight/git wrappers work by relative path
- Run existing root script tests to verify Claude behavior remains intact.
- Fixture vault tests:
  - setup dry-run
  - setup apply
  - planned/applied managed artifacts
  - resume incomplete setup
  - reconcile missing managed artifacts
  - recall
  - session-save
  - vault-manager health-check
- Path safety tests:
  - setup managed artifacts traversal escape
  - session-save traversal escape
  - vault-manager add traversal escape
  - vault-manager organize traversal escape
  - symlink parent escape
  - absolute path rejection
  - NUL rejection
- Git safety tests for session-save and vault-manager:
  - pre-existing staged file
  - pre-existing unstaged file
  - both staged and unstaged changes
  - clean repo
  - only clean repo stages/commits touched paths
- Vault resolver tests:
  - `OBSIDIAN_VAULT` set
  - config pointer fallback
  - neither set -> `action_required_env`
  - realpath mismatch
- Codex marketplace discovery smoke:
  - temp `HOME`
  - use documented Codex-native/sparse path if `codex` is available
  - verify `.agents` marketplace entry installs from
    `./plugins/oh-my-obsidian`
  - verify the flow does not rely on `.claude-plugin` legacy entry
  - if `codex` is unavailable, document manual smoke steps
- Hooks preview tests:
  - merge-preserve
  - duplicate prevention
  - rollback/skip
  - feature off
  - no state
  - no vault
  - valid vault JSON output

## Phase 7. Implementation Start

- After this saved plan passes document validation, implement from Phase 1.
- If implementation requires existing Claude file changes, stop and ask for
  approval before editing those files.
