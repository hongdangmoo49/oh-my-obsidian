# Codex Plugin Handoff

## Goal

Continue adding Codex Plugin support for `oh-my-obsidian` while preserving the
existing Claude Code plugin behavior and keeping the guided setup wizard as the
core product UX.

## Current State

- Repository: `/home/ubuntu/github/my-pjts/oh-my-obsidian`
- Branch: `main`
- Existing Claude Code plugin is already distributed from the repository root.
- Existing Claude files must not be modified unless absolutely necessary and
  explicitly approved:
  - `.claude-plugin/*`
  - `commands/*`
  - `agents/*`
  - `hooks/*`
  - root `skills/*`
  - `bin/*`
  - root `scripts/*`
- A Codex implementation plan has been drafted at:
  - `docs/codex-plugin-implementation-plan.md`
- Current git state at handoff:
  - `docs/codex-plugin-implementation-plan.md` added/modified
  - `docs/handoff/2026-04-23-codex-plugin-handoff.md` added
- No Codex plugin implementation files have been created yet.
- The implementation plan was validated through repeated subagent review loops.
  The last validation feedback was resolved by adding:
  - setup-state bootstrap exception for creating `vaultRoot/.oh-my-obsidian`
  - explicit vault resolver order: candidate path -> setup-state read -> realpath
    comparison

## Locked Decisions

- Do not make the repo root the Codex plugin root. The repo root has
  Claude-specific `skills/`, `commands/`, `agents/`, and `.mcp.json`, which can
  collide with Codex plugin discovery.
- Use this Codex plugin root:
  - `plugins/oh-my-obsidian/`
- Use this Codex plugin identity everywhere:
  - folder name: `oh-my-obsidian`
  - `.codex-plugin/plugin.json` `name`: `oh-my-obsidian`
  - `.agents/plugins/marketplace.json` `plugins[].name`: `oh-my-obsidian`
- Add a native Codex marketplace file:
  - `.agents/plugins/marketplace.json`
  - top-level `name`: `omob-codex`
  - plugin source path: `./plugins/oh-my-obsidian`
- Leave `.claude-plugin/marketplace.json` unchanged. Codex docs should use the
  `.agents` marketplace/sparse/local install path and should not rely on the
  Claude legacy marketplace entry.
- Codex v1 must include the guided setup skill. A recall/session-save-only MVP
  misses the product's core value.
- Hooks are preview-only and opt-in. Do not put hooks in
  `.codex-plugin/plugin.json`.
- Do not copy Claude prompt/agent files verbatim into the Codex plugin. Port
  only the useful behavior and remove Claude-specific syntax.
- Use subagents aggressively in the next Codex session:
  - Use reviewer/docs/architect subagents to validate each plan or non-trivial
    patch before committing to it.
  - Keep the main agent focused on integration and edits.
  - Close completed subagents so the thread limit does not block new workers.
  - Treat subagent feedback as actionable only when it applies to the current
    phase. One reviewer incorrectly flagged missing implementation while the
    task was still plan validation; that was classified as out of scope.

## Contracts

### Codex Plugin Structure

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

### Marketplace Shape

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

### Vault Resolver

Codex skills resolve the vault as follows:

1. Try `OBSIDIAN_VAULT`.
2. If missing, try `~/.oh-my-obsidian/config.json` `vaultPath`, but only if
   setup created that pointer after explicit user approval.
3. Resolve candidate realpath.
4. Read `<candidate>/.oh-my-obsidian/setup-state.json`.
5. Compare candidate realpath to setup-state `vaultRealPath`.
6. If no resolver works, mutating skills must stop and direct the user to the
   Codex setup skill.

### Setup-State

Path:

```text
vaultRoot/.oh-my-obsidian/setup-state.json
```

Required schema fields:

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

Each `managedArtifacts[]` entry includes:

- `relativePath`
- `kind`: `dir | file | config`
- `source` or `template`
- `planned`
- `applied`
- `checksum` or `contentHash` when applicable
- `lastAppliedAt`

Setup bootstrap exception:

- After explicit create confirmation, setup may create only `vaultRoot` and
  `vaultRoot/.oh-my-obsidian` before setup-state exists.
- Immediately after that bootstrap, write `in_progress` setup-state and planned
  `managedArtifacts` before any other vault artifact mutation.

### Path Safety

All vault-relative write targets from setup, session-save, and vault-manager:

- reject absolute paths
- reject `..`
- reject NUL bytes
- resolve parent realpath before writing
- require parent realpath to remain inside `vaultRoot`
- reject symlink escape outside the vault
- never overwrite unless the artifact is managed and reconciliation is
  explicitly confirmed

### Git Safety

Session-save and vault-manager mutations use this order:

1. Inspect existing git status and index.
2. If unrelated staged/dirty/ambiguous state exists, create the intended file
   when safe but skip staging/commit and report the path.
3. Only when safe, stage exactly touched paths.
4. Commit.
5. Verify index after commit.

## Relevant Files

- `docs/codex-plugin-implementation-plan.md`
  - Main implementation plan. Read this first.
- `.claude-plugin/plugin.json`
  - Existing Claude plugin manifest. Preserve.
- `.claude-plugin/marketplace.json`
  - Existing Claude marketplace. Preserve.
- `commands/setup.md`
  - Current Claude guided setup flow. Use as behavioral source, not as a file to
    edit or copy verbatim.
- `commands/refactor.md`
  - Current Claude refactor flow. Defer Codex refactor to later unless asked.
- `skills/recall/SKILL.md`
  - Source behavior for Codex recall skill.
- `skills/session-save/SKILL.md`
  - Source behavior for Codex session-save skill.
- `skills/obsidian-vault-manager/SKILL.md`
  - Source behavior for Codex vault manager skill.
- `scripts/obsidian-app-preflight.mjs`
  - Existing helper. Port behavior into plugin-local Codex script; do not copy
    `CLAUDE_PLUGIN_ROOT` dependency.
- `scripts/obsidian-git-setup.mjs`
  - Existing Obsidian Git helper. Port/use behavior in plugin-local Codex
    scripts. Existing helper already writes `.oh-my-obsidian/setup-state.json`
    for Obsidian Git status.
- `hooks/hooks.json`
- `hooks/stop-hook.sh`
  - Claude hook behavior source. Codex hooks are preview-only and must be
    implemented as snippets/opt-in, not manifest defaults.

## Open Risks

- Codex plugin marketplace behavior can read `.claude-plugin/marketplace.json`.
  The plan avoids relying on that legacy entry by adding `.agents/plugins`.
  Verify with Codex if available.
- `plugins/oh-my-obsidian/` duplicates or ports helper scripts from root.
  This creates drift risk. The plan requires plugin-local tests and existing
  root script tests to catch drift/regression.
- Hook support is experimental/preview. Keep hooks off by default.
- Codex custom subagent installation should not be required for v1 setup.
  The setup skill should include a single-agent fallback.
- Current machine had unstable internet. On a new machine, prefer local docs and
  official Codex docs; browse only when necessary.

## Acceptance Criteria

- Existing Claude plugin files remain unchanged unless explicitly approved.
- `docs/codex-plugin-implementation-plan.md` remains the source plan for this
  implementation.
- Codex plugin root exists at `plugins/oh-my-obsidian/`.
- `.agents/plugins/marketplace.json` exists and points to
  `./plugins/oh-my-obsidian`.
- Codex v1 includes a real guided setup skill, not only recall/session-save.
- Codex setup supports:
  - preflight
  - interview
  - structure proposal
  - dry-run
  - confirmation
  - setup-state
  - Obsidian Git safe/manual/team-sync choices
  - validation summary
- Mutating skills use vault resolver, setup-state validation, path safety, and
  git safety.
- Hooks are opt-in preview only.
- Documentation clearly separates Claude install from Codex install.

## Verification

Run or add these checks during implementation:

```bash
git status --short
```

Expected: only intentional Codex implementation files and docs are changed.

```bash
rg 'CLAUDE_PLUGIN_ROOT|TOOLDI_VAULT|AskUserQuestion|allowed-tools|argument-hint|Agent\\(' plugins/oh-my-obsidian .agents/plugins
```

Expected: no matches.

```bash
node --check plugins/oh-my-obsidian/scripts/*.mjs
bash -n plugins/oh-my-obsidian/scripts/*.sh
```

Expected: no syntax errors. Adjust globs if some file types are absent.

```bash
bash scripts/test-obsidian-preflight.sh
bash scripts/test-obsidian-git-setup.sh
```

Expected: existing Claude/root helper behavior still passes.

Add fixture tests for:

- setup dry-run/apply
- managedArtifacts planned/applied updates
- resume incomplete setup
- reconcile missing managed artifacts
- traversal and symlink escape rejection
- session-save git dirty/index cases
- vault-manager git dirty/index cases
- vault resolver env/config/missing/realpath mismatch cases
- hook preview JSON output and merge-preserve behavior

If `codex` is available on the new machine, add a smoke check with a temporary
`HOME` using the documented `.agents`/sparse/local marketplace path. Expected:
Codex installs `oh-my-obsidian` from `./plugins/oh-my-obsidian` and does not
depend on the Claude legacy marketplace entry.

## Start Prompt

Continue the Codex Plugin implementation for `/home/ubuntu/github/my-pjts/oh-my-obsidian`.
First read `docs/codex-plugin-implementation-plan.md` and this handoff. Use
subagents aggressively: have at least a reviewer and docs/spec checker validate
non-trivial plan or patch decisions before implementation. Start by completing
document validation if needed, then implement Phase 1 from the plan:
`plugins/oh-my-obsidian/` scaffold and `.agents/plugins/marketplace.json`.
Preserve all existing Claude plugin files unless explicit approval is obtained.

