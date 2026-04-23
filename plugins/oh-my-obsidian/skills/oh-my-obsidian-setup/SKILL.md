---
name: oh-my-obsidian-setup
description: Use this skill when the user wants to initialize oh-my-obsidian, create or attach an Obsidian vault, configure persistent vault resolution, or prepare Obsidian Git integration.
---

# Oh My Obsidian Setup

Use this skill when the user wants to initialize oh-my-obsidian, create an
Obsidian vault, attach an existing vault, configure persistent vault resolution,
or prepare Obsidian Git integration.

## Non-Negotiable Contracts

- Use the selected vault directory as `vaultRoot`.
- Do not mutate a vault before a dry-run summary and explicit user approval.
- Before any non-bootstrap vault artifact mutation, write
  `vaultRoot/.oh-my-obsidian/setup-state.json` with `status: "in_progress"` and
  planned `managedArtifacts`.
- The only bootstrap exception before setup state exists is creating `vaultRoot`
  and `vaultRoot/.oh-my-obsidian`.
- Mutating follow-up skills must resolve the vault through `OBSIDIAN_VAULT`
  first, then the approved Codex config pointer at
  `~/.oh-my-obsidian/config.json`.
- If neither resolver works, report `action_required_env` and stop mutation.
- Do not depend on repository root scripts, root `bin/`, or legacy Claude-only
  environment variables.

## Helper Scripts

Resolve the plugin directory from this skill location, then use plugin-local
helpers:

```bash
node scripts/obsidian-app-preflight.mjs check
node scripts/setup-vault.mjs dry-run --preflight-json "<json-or-file>" --vault "<path>" --project-name "<name>" --domain "<domain>" --domain "<domain>"
node scripts/setup-vault.mjs apply --preflight-json "<json-or-file>" --vault "<path>" --project-name "<name>" --domain "<domain>" --domain "<domain>"
node scripts/setup-vault.mjs attach --preflight-json "<json-or-file>" --vault "<path>" --project-name "<name>" --domain "<domain>" --domain "<domain>"
node scripts/setup-vault.mjs validate --vault "<path>"
node scripts/obsidian-git-setup.mjs check "<path>"
```

Only add `--create-config-pointer`, `--git init`, Obsidian Git `apply`, package
manager installs, shell profile edits, remote changes, or push commands after
separate explicit approval.

## Setup Flow

1. Run Obsidian app preflight.
   - If Obsidian is installed, summarize path/version when available.
   - If it is missing and auto-install is available, show method and command,
     then ask before running install.
   - If preflight reports `git.status != "usable"`, explain the issue before
     any git-related setup. On macOS broken developer tools paths, show
     `git.fixCommand` when present.
   - If running in a container, never install a desktop app. Ask whether to
     continue and install Obsidian on the desktop host later.
   - In WSL, only use the Windows host check/install path after approval.
   - Preserve the successful preflight JSON and pass it to
     `setup-vault.mjs --preflight-json ...` so setup-state records the real
     preflight outcome.

2. Interview the user.
   - Ask one focused Korean or English question at a time.
   - Gather project name, project purpose, existing/greenfield status, tech
     stack, team context, workflow, and at least two knowledge domains.
   - Use `references/interviewer.md` for question strategy.
   - If subagents are unavailable or unnecessary, continue as a single agent.

3. Propose the vault structure.
   - Use `references/vault-architect.md`.
   - Include a service layer under a project/service folder, the required
     `작업기록` layer, and `scripts/team-setup`.
   - Show rationale, vault path, and exact managed artifact list.
   - Regenerate if the user asks for changes.

4. Dry run.
   - Run `setup-vault.mjs dry-run --preflight-json "<saved-json-or-file>"`.
   - Present planned artifacts, approvals still required, and whether resolver
     completion needs `OBSIDIAN_VAULT` or an approved config pointer.

5. Apply after approval.
   - Run `setup-vault.mjs apply --preflight-json "<saved-json-or-file>"`.
   - Add `--create-config-pointer` only if the user approved that pointer.
   - Add `--git init` only if the user approved git initialization.
   - Do not add `--git init` if preflight reported `git.status != "usable"`.
   - If the result is `action_required_env`, show exact environment steps and do
     not call the setup complete.

6. Obsidian Git choice.
   - Offer `safe`, `manual`, `team-sync`, or `skip`.
   - Explain that third-party download, community plugin enablement, and
     auto-sync are separate approvals.
   - For `safe`, apply plugin files only without enablement.
   - For `manual`, require approval before enabling the community plugin.
   - For `team-sync`, require approval and verify git remote/upstream first.
   - Do not offer automatic `team-sync` while preflight reports
     `git.status != "usable"`.
   - If team sync is blocked, do not add remotes or push automatically. Show
     commands or offer safe/manual fallback.

7. Validate.
   - Run `setup-vault.mjs validate`.
   - If Obsidian Git was applied, run `obsidian-git-setup.mjs validate`.
   - Report project name, vault path, resolver source, setup-state status,
     Obsidian Git status, and remaining manual actions.

## Re-Run Behavior

- If setup state is missing and the vault already exists, offer
  `setup-vault.mjs attach --preflight-json "<saved-json-or-file>"` only for a
  compatible no-overwrite attach. If the vault already has conflicting managed
  files or a stray `.oh-my-obsidian` directory, explain that manual cleanup or a
  fresh vault path is required before attach.
- If setup state is `in_progress` or `failed`, offer resume.
- If managed artifacts are missing, run reconcile dry-run first.
- Deletions, moves, overwrites, shell profile mutation, and `.obsidian` changes
  require a diff/dry-run and separate approval.

## Output Style

Keep setup summaries concise and decision-oriented. Show the user what will be
created or changed, what requires approval, and what remains manual.
