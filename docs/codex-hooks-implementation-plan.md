# Codex Hooks Implementation Plan

## Purpose

Status: implemented. This file is retained as the implementation checklist and
review guide for upgrading `oh-my-obsidian` from the previous Codex hooks
preview to official Codex hooks support.

During the implementation, this file was used as the source of truth for scope,
sequencing, and completion criteria.

## Non-Negotiable Principles

1. Preserve the root Claude plugin surface.
2. Keep Codex implementation work inside `plugins/oh-my-obsidian/` unless a
   repo-level Codex marketplace, documentation, or agent instruction update is
   explicitly part of this plan.
3. Make `repo-local` Codex hooks the default because the product is built around
   project-specific Obsidian vaults.
4. Keep `user-global` hooks as an advanced option, not the default.
5. Do not edit `.codex/*`, shell profiles, global config pointers, or hook files
   without an explicit dry-run and approval flow in the user-facing setup path.
6. Use Node-based hook runtime code for Mac, Linux, and Windows support.
7. Use `config.toml` for the `codex_hooks` feature flag and `hooks.json` for
   hook definitions. Avoid inline `[hooks]` in `config.toml` by default.
8. Default hook behavior should be `SessionStart` lite context plus `Stop`
   session-save reminder.
9. Keep hook context small. `SessionStart` should not dump vault contents.
10. Maintain backward compatibility for existing `hookPreview` setup-state data
    while moving the public model toward official `codexHooks` terminology.

## Big Step 1: Freeze The Baseline

### Substeps

1. Inspect the current `hook-preview` implementation and tests.
2. Inspect setup-state creation and validation paths.
3. Inspect vault resolver behavior and config pointer handling.
4. Run the existing hook-preview test suite before edits.
5. Record any pre-existing dirty worktree state and avoid mixing unrelated
   changes into the implementation patch.

### Completion Criteria

- Existing behavior is understood before edits.
- Existing tests either pass or known failures are documented.
- Claude root files are not modified accidentally.

## Big Step 2: Reframe Hooks As Official Codex Support

### Substeps

1. Rename or replace the preview-facing helper surface with official Codex hooks
   terminology.
2. Decide whether to keep the old helper as a compatibility shim or migrate
   callers directly.
3. Introduce a `codexHooks` state model while preserving old `hookPreview`
   setup-state reads.
4. Model install modes explicitly:
   - `repo-local`
   - `user-global`
   - `skip`
5. Keep `repo-local` as the recommended setup option.

### Completion Criteria

- The implementation no longer presents Codex hooks as merely preview in the
  Codex setup path.
- Existing users with `hookPreview` setup-state are not broken.

## Big Step 3: Build The Cross-Platform Hook Runtime

### Substeps

1. Add a Node-based hook runner under the Codex plugin.
2. Implement `stop` behavior equivalent to the current reminder hook.
3. Implement `session-start` behavior that emits small project/vault context.
4. Resolve the vault in this order:
   - project-local Codex pointer
   - `OBSIDIAN_VAULT`
   - approved global pointer
5. Validate setup-state before emitting useful context.
6. Return official Codex-compatible output for each event.
7. Avoid hard dependencies on `bash`, `chmod`, or `python3`.

### Completion Criteria

- The runtime works by invoking `node "<path>/hook-runner.mjs" <event>`.
- `Stop` produces a safe reminder only when the vault is valid.
- `SessionStart` produces compact context only when the vault is valid.
- Invalid or missing setup state degrades to a safe no-op.

## Big Step 4: Implement Official Hook Installation

### Substeps

1. Add or replace the installer helper with official Codex hook install logic.
2. In `repo-local` mode, manage:
   - `<repo>/.codex/config.toml`
   - `<repo>/.codex/hooks.json`
   - `<repo>/.codex/hooks/oh-my-obsidian/hook-runner.mjs`
   - `<repo>/.codex/oh-my-obsidian.local.json`
3. In `user-global` mode, manage the equivalent user-level files only after
   explicit approval.
4. Preserve existing `hooks.json` entries and avoid duplicate commands.
5. Add `[features] codex_hooks = true` without overwriting unrelated
   `config.toml` settings.
6. Produce dry-run output that lists exact file changes and rollback guidance.
7. Make `apply` use the same plan produced by dry-run.

### Completion Criteria

- Installation handles both config feature flag and hook definitions.
- Existing Codex hooks are preserved.
- Re-running install is idempotent.
- Invalid existing config fails safely without destructive rewrites.

## Big Step 5: Integrate With Setup UX

### Substeps

1. Add an official Codex hooks step after vault validation.
2. Offer setup choices in this order:
   - recommended `repo-local`
   - advanced `user-global`
   - skip for now
   - direct input
3. Explain that `repo-local` matches project-specific vault design.
4. Require explicit approval before writing `.codex/*` or user-level Codex
   files.
5. Update setup-state with hook installation status after successful apply.
6. Ensure rerun, attach, and validate flows can report hook status.

### Completion Criteria

- Setup can install official Codex hooks as a first-class flow.
- Setup can also skip hooks cleanly.
- Health and validation output can identify missing feature flag, missing hook
  config, missing runner, or invalid vault pointer.

## Big Step 6: Support Mac, Linux, And Windows

### Substeps

1. Remove the current Windows hard block from the new official installer path.
2. Use Node command invocation consistently across platforms.
3. Quote paths safely in generated hook commands.
4. Normalize Windows paths in config and pointer files.
5. Add fixtures for Windows-style paths without requiring the test host to run
   Windows.
6. Keep platform-specific limitations visible in validation output.

### Completion Criteria

- Mac and Linux work without shell-specific runtime dependencies.
- Windows is supported through Node command invocation.
- Path handling is covered by tests.

## Big Step 7: Expand Tests

### Substeps

1. Keep existing merge preservation and duplicate prevention coverage.
2. Add tests for `config.toml` feature flag insertion and preservation.
3. Add tests for project-local pointer precedence.
4. Add tests for `SessionStart` valid/no-op output.
5. Add tests for `Stop` valid/no-op output.
6. Add tests for idempotent apply.
7. Add tests for invalid `hooks.json` and invalid `config.toml`.
8. Add Windows path fixture tests.

### Completion Criteria

- Hook installer, runtime, resolver, and setup-state behavior have focused
  coverage.
- Existing setup/vault tests still pass or are updated for intentional behavior
  changes.

## Big Step 8: Update Documentation

### Substeps

1. Update the root README Codex section to say official Codex hooks are
   supported.
2. Update the Codex plugin README to explain:
   - why `repo-local` is recommended
   - why `config.toml` and `hooks.json` are both touched
   - what `SessionStart` and `Stop` do
   - how to skip or remove hooks
3. Keep the research document as background context.
4. Add concise troubleshooting notes for trust, feature flag, and vault pointer
   issues.

### Completion Criteria

- User-facing docs match the actual official hook implementation.
- No docs still describe Codex hooks as only a preview, except historical
  research notes.

## Big Step 9: Final Verification And Cleanup

### Substeps

1. Run focused hook tests.
2. Run relevant plugin tests for setup, vault core, vault ops, and history if
   affected.
3. Run public safety checks if docs or install behavior changed.
4. Inspect `git diff` for accidental Claude root changes.
5. Confirm the final behavior against this plan.
6. Remove the temporary implementation-plan pointer from `AGENTS.md`.
7. If this plan file is no longer useful after completion, either remove it or
   convert it into a historical implementation note.

### Completion Criteria

- Tests and docs are aligned.
- `AGENTS.md` no longer contains the temporary instruction to keep consulting
  this implementation plan.
- The final patch can be reviewed without temporary coordination scaffolding.
