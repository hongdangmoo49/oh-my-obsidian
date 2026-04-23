# VM Validation Runbook

This directory contains a public-safe validation framework for testing the
Codex plugin in disposable environments.

## Scope

The goal is to validate real user flows in clean VMs without committing any
machine-specific or secret material to the repository.

The framework is split into:

- `scripts/`: reusable assertions and environment bootstrap helpers
- `scenarios/`: human-readable scenario definitions for Linux, Windows, and
  other platform contexts
- `artifacts/`: local-only output directory for transcripts, logs, screenshots,
  and copied state files. This directory is ignored on purpose.

## Public Repo Safety Rules

These files are meant to live in a public repository. Do not commit:

- auth tokens
- PATs, SSH keys, or cloud credentials
- real email addresses or usernames used outside test fixtures
- private hostnames, internal domains, or VPN-only IPs
- copied `.codex`, `.oh-my-obsidian`, or vault data from a real workstation
- raw VM transcripts containing secrets

Only commit:

- placeholders like `<repo-root>`, `<vault-path>`, `<temp-home>`
- generic example identities such as `qa-user`
- sanitized transcripts if you later decide to publish sample runs

## Environment Rules

Each scenario should run in a disposable environment with all of the following
isolated per run:

- OS user
- `HOME`
- `.codex`
- `.oh-my-obsidian`
- repository clone
- vault path
- bare git remote

The helper scripts in `scripts/` assume disposable targets. They intentionally
avoid hidden defaults to reduce accidental writes into a real home directory.

## Recommended Execution Order

1. Run repo-local regression first:
   - plugin-local tests
   - root helper tests
2. Run Linux native VM acceptance:
   - fresh setup
   - attach/reconcile
   - recall/session-save
   - vault manager
   - hook preview
3. Run platform smoke cases:
   - Windows native preflight
   - macOS native preflight
   - WSL/container limitations

## Sparse / Local Codex Install Note

For a local checkout, the supported Codex marketplace path is the repository
file:

```text
.agents/plugins/marketplace.json
```

That entry resolves the plugin from:

```text
./plugins/oh-my-obsidian
```

If you use a local checkout, run `codex plugin marketplace add <repo-root>`.
The `--sparse` flag is only supported for git marketplace sources, not local
directory sources. For remote git sources, keep `.agents/` and
`plugins/oh-my-obsidian/` available in the sparse checkout.

## Minimal Manual Loop

For a single Linux VM acceptance run:

1. Clone the repo to `<repo-root>`.
2. Create a disposable home:
   ```bash
   qa/scripts/reset-home.sh <temp-home>
   ```
3. Create a disposable bare remote:
   ```bash
   qa/scripts/make-bare-remote.sh <temp-workdir>
   ```
4. Add the Codex marketplace:
   ```bash
   HOME=<temp-home> codex plugin marketplace add <repo-root>
   ```
5. Follow one of the scenario YAMLs in `scenarios/linux-native/`.
6. Use the assertion scripts to verify final state.
7. Save logs under `qa/artifacts/` if you need them locally.
8. Delete the VM or revert to a snapshot.

## Assertions

### Setup state

```bash
qa/scripts/assert-setup-state.sh <vault-path> [expected-status]
```

Checks:

- `setup-state.json` exists
- schema matches
- `vaultRealPath` matches the real path of the vault
- `managedArtifacts[]` is shaped correctly
- applied artifacts exist on disk

### Git safety

```bash
qa/scripts/assert-git-safe.sh <repo-path> [--expect-clean] [--expect-no-staged] [--expect-branch BRANCH]
```

Checks:

- repo availability
- staged/index cleanliness if requested
- branch name if requested
- head commit message if requested

### Hook merge

```bash
qa/scripts/assert-hook-merge.sh <hooks.json> <expected-command> [preserved-command]
```

Checks:

- valid JSON
- `hooks.Stop` remains an array
- expected hook command exists exactly once
- existing hook command is preserved when supplied

### Public-safety scan

```bash
qa/scripts/check-public-safety.sh qa
```

Scans for obvious secret material or machine-specific paths in the QA files
before committing them.

## Scenario Files

Each scenario file is intentionally declarative and public-safe. It describes:

- prerequisites
- approvals to give or deny
- commands to run
- Codex prompts to use
- assertions to check
- artifacts to capture locally
- public-redaction reminders

Start with:

- `scenarios/linux-native/fresh-setup.yaml`
- `scenarios/linux-native/session-save-ambiguous.yaml`
- `scenarios/linux-native/attach-existing.yaml`
- `scenarios/linux-native/hook-preview.yaml`
- `scenarios/windows-native/preflight.yaml`

## Suggested Artifact Capture

Keep these local-only when a scenario fails:

- Codex transcript
- `setup-state.json`
- `git status --porcelain=v1`
- `git log --oneline -n 5`
- `.codex/hooks.json` before/after
- `.obsidian/community-plugins.json`
- helper JSON output

Do not commit captured artifacts back into the repo.
