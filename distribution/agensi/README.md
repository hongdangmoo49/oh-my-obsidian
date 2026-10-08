# Oh My Obsidian Free

Free local Obsidian project memory for Codex CLI and Claude Code. Price: $0.
Source: https://github.com/hongdangmoo49/oh-my-obsidian
License: MIT; see LICENSE. No paid tier, license key or subscription is required
by this package. Your agent/API provider and Obsidian's optional services may
have their own costs. Community support, not a service-level agreement.

## Candidate validation status

This 0.3.6 candidate includes the shared Claude auto-save implementation from
PR #23, integrated together with the distribution work in PR #24. Do not describe
it as fully production-validated. The 2026-10-08 live Claude smoke failed with an
authentication error; local integration tests are separate from successful
model-driven E2E. The same day's Codex Windows unelevated fresh-session smoke
completed the task and verified the automatic summary receipt.
macOS/Linux and Windows elevated CLI smoke remain separate validation targets.

## Requirements

- Node.js 22 or newer on PATH; tested with Node 24.13.1.
- Codex CLI or Claude Code, with a working account/API connection.
- Git for repo-local Codex hooks. A skill-folder install is not a Git worktree.
- An explicitly approved local vault. Obsidian's desktop app is useful for
  browsing notes, but installing or launching it is not automatic.
- Writable project/configuration paths and approved access to the vault.

## Installation

Unzip so SKILL.md is directly inside the chosen skill folder; no extra enclosing
directory. Keep the folder in a stable location. Ask the agent to use the skill.
It will ask before registering the bundled native plugin and connecting a vault.
Without native registration, lifecycle hooks do not run automatically.

Native marketplace names are intentionally different from the GitHub installs:
Claude uses omob-agensi; Codex uses omob-agensi-codex. If you already installed
oh-my-obsidian from GitHub, update or explicitly migrate that copy instead of
enabling both. No installer removes another plugin automatically.

After approval, register the local marketplace and install the plugin as shown
in SKILL.md. Start a new session and allow the reviewed hook definitions. The
bundle's native setup/save/recall wrappers refer to local packaged helpers.
New vaults use a dry-run/approval/apply flow; existing vaults are not recreated.
No shell profile changes, background Git commits, cloud sync, MCP connection,
telemetry or software downloads are enabled by default.

## Data and safety

Notes are written under the selected vault's
작업기록/세션기록/YYYY-MM/YYYY-MM-DD/ folder. Automatic updates retain earlier
content. User edits, stale revisions, unsafe paths and common sensitive/raw-input
patterns are refused. Do not delete checks or force a manual overwrite to retry.
Notes are capped at 64 KiB. Detection has false positives and false negatives.
No raw transcript is read in the automatic path. The model still sees the normal
conversation; local notes do not imply that your model runs locally.

## Updates and removal

Agensi distributes uploaded ZIP versions, not GitHub auto-sync. Download the new
version, review it, replace the bundle at the same path and reinstall/update the
native local plugin after checking its version. Reapply copied Codex hooks from
the updated bundle; those files do not update merely because a ZIP was replaced.
For Claude, follow the setup guide's approved migration, not a new SessionEnd
Claude process. Never store real settings, notes, credentials or local pointers
inside the distribution folder; an update must not erase personal data.

To uninstall, use the relevant native plugin manager for this marketplace only.
Removing the generic skill folder alone does not remove registered hooks or the
native cache. Remove only this package's approved hook/configuration entries,
with confirmation; leave other hooks and vault Markdown intact. To disable
automatic Claude saving only, use the migration helper's --disable plan/apply.

## Permissions needing review

The agent may execute Node helpers, write notes in your selected vault, and
write its own hook/pointer configuration after approval. These actions can be
outside the current project. No elevated permissions or sandbox bypass are
required by the package. If permission is denied, stop and report the failure.
