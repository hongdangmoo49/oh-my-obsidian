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

## Bundled References

Resolve bundled references relative to the directory that contains this
`SKILL.md` before searching anywhere else.

- For interview strategy, read
  [`./references/interviewer.md`](references/interviewer.md).
- For vault structure planning, read
  [`./references/vault-architect.md`](references/vault-architect.md).
- If a reference is not found on the first attempt, derive its absolute path
  from the current `SKILL.md` location and retry there before searching the
  plugin root, repository root, installed cache root, or current working
  directory.

## Interactive Question Mode

When the setup flow needs a user decision, approval, or missing project detail,
imitate Claude Ask mode or Codex Plan mode as closely as Codex skills allow.

- Keep one question or one decision per turn.
- Present exactly four numbered choices whenever a branch or approval is needed.
- Options `1`, `2`, and `3` should be concrete choices for the current step.
- Option `1` should be the recommended or default path when one exists.
- Option `4` must always be `직접 입력` and allow any free-form answer.
- Accept `1`, `2`, `3`, `4`, `4: ...`, or the exact option label as valid
  replies.
- If the user asks a side question or gives an ambiguous answer, answer
  briefly, then restate the same four choices before proceeding.
- Do not ask the user to respond with an empty message or implicit confirmation.

Use this exact interaction shape:

```text
<짧은 현재 상황 요약>

다음 중 하나로 답해주세요.
1. <권장 선택지>
2. <대안 1>
3. <대안 2 또는 이번 단계 건너뛰기/중단>
4. 직접 입력
```

Guidance by question type:

- For install/approval questions, option `3` should usually mean `지금은
  건너뛰기` or `여기서 중단`.
- For interview questions, options `1` to `3` should be plausible common
  answers, and option `4` should capture custom project details.
- If the decision is effectively binary, still keep four choices by using:
  recommended path, safe alternative, skip for now, direct input.

## Setup Flow

1. Run Obsidian app preflight.
   - If Obsidian is installed, summarize path/version when available.
   - If it is missing and auto-install is available, show method and command,
     then ask before running install with the four-choice interaction mode.
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
   - Read [`./references/interviewer.md`](references/interviewer.md) for
     question strategy.
   - Even during the interview, present three plausible choices plus `4. 직접
     입력` whenever possible instead of using only open-ended prose.
   - If subagents are unavailable or unnecessary, continue as a single agent.

3. Propose the vault structure.
   - Read [`./references/vault-architect.md`](references/vault-architect.md)
     before proposing the vault structure.
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

8. Optional History Restore (non-blocking).
   - After validation, check if Codex session data exists by running:
     `node scripts/codex-history.mjs scan --cwd "<current-working-dir>"`
   - If sessions are found, offer restore using the four-choice interaction mode:
     ```text
     Codex 세션 기록 N개를 발견했습니다. 볼트에 복원할까요?

     다음 중 하나로 답해주세요.
     1. 네, 복원해주세요 (권장)
     2. 나중에 $oh-my-obsidian-restore-history로 복원
     3. 건너뛰기
     4. 직접 입력
     ```
   - If user approves, run:
     `node scripts/codex-history.mjs restore --vault "<vault-path>" --cwd "<current-working-dir>"`
   - Report the result (number restored, number skipped, git commit status).
   - If any error occurs, print a warning and continue to the success message.
   - This entire step is non-blocking: failures do not affect setup status.

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
