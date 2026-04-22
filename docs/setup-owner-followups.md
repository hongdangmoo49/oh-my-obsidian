# Setup Owner Follow-ups

This document records follow-up work for the setup areas owned by the Obsidian
app preflight and Obsidian Git setup flow. It intentionally avoids changing the
teammate-owned project interview and vault structure flow.

## Current Decision

Do not add new Git repository questions in the middle of the existing interview
flow until the teammate's Q1-Q6 work is merged. The current setup command is a
Claude-guided wizard, so adding another question branch now can conflict with
the teammate's orchestration.

The current split is acceptable for integration:

- `commands/setup.md` owns conversational UX and user confirmation.
- `obsidian-app-preflight` owns deterministic desktop app detection/install
  actions.
- `obsidian-git-setup` owns deterministic vault-level Obsidian Git installation
  and validation.

## Obsidian App Preflight

### Keep

- Run `obsidian-app-preflight check` before the vault interview.
- Ask before running desktop app installation.
- Use Homebrew cask on native macOS when Obsidian is missing and Homebrew exists.
- Do not install desktop apps from container contexts.

### Follow-ups

1. Record preflight outcome in setup state after the vault exists.

   Suggested state fields:

   ```json
   {
     "obsidianApp": {
       "platform": "macos",
       "context": "native",
       "status": "installed|installed-by-setup|skipped|manual-required|failed",
       "path": "/Applications/Obsidian.app",
       "installMethod": "homebrew-cask",
       "checkedAt": "..."
     }
   }
   ```

   Reason: today, an install-later decision lives mostly in Claude's conversation
   context. Persisting it makes reruns and support clearer.

2. Make the user-facing installed/missing summary more explicit.

   When Obsidian is found, show the detected app path and version if available.
   When Obsidian is missing, show the exact install command and manual URL before
   asking for approval.

3. Preserve the current safety boundary.

   The setup command may ask and explain, but machine probing and installation
   should remain in the helper. Avoid duplicating OS detection logic in the
   markdown command.

## Obsidian Git Setup

### Keep

- Install Obsidian Git only after the vault exists.
- Use the helper for release download, zip validation, vault file writes, and
  validation.
- Keep Restricted Mode untouched. The user may still need to approve community
  plugins in Obsidian.
- Block `team-sync` when git, remote, or upstream tracking is missing.

### Follow-ups

1. Decide the `new` repository policy after the teammate's Q6 flow lands.

   If the user selects an existing remote URL and the setup clones it, `team-sync`
   should usually have `origin` and upstream tracking already.

   If the user selects `new`, the setup currently creates only a local git repo.
   In that case, `team-sync` should either:

   - ask for a remote URL after the teammate flow is merged, then run
     `git remote add origin <url>` and `git push -u origin <branch>`, or
   - clearly fall back to manual/safe mode without trying to invent a remote.

2. Make blocked `team-sync` UX deterministic.

   Current setup guidance says to explain blocked issues and fall back to manual
   or safe after confirmation. Claude may autonomously create extra options such
   as "connect remote and retry". After merging the teammate flow, tighten the
   allowed choices so the user sees a stable UX.

   Suggested choices:

   - Stop and show required git commands.
   - Apply manual mode.
   - Apply safe mode.

3. Fix preset transition semantics before promoting this as a repeated setup
   operation.

   Today, the helper merges existing Obsidian Git `data.json` with the selected
   preset. Reapplying safe/manual after team-sync can leave old sync-related keys
   behind unless every key is explicitly overwritten.

   Define the policy:

   - safe: plugin files installed, plugin disabled, all auto sync off
   - manual: plugin enabled, all auto sync off
   - team-sync: plugin enabled, auto commit/pull/push on

   Then update tests to cover team-sync -> safe and team-sync -> manual
   transitions.

4. Improve remote/upstream diagnostics.

   The helper currently checks that at least one remote exists and that the
   current branch has an upstream. Later, expose more details in JSON:

   - remote names and URLs
   - current branch
   - upstream branch
   - suggested `git remote add` / `git push -u` commands when missing

   Do not run credential checks or manage SSH/PAT credentials in this plugin.

5. Keep one-minute team sync explicit.

   The one-minute policy should remain opt-in. When selected, the helper should
   continue writing:

   ```json
   {
     "autoSaveInterval": 1,
     "autoPullInterval": 1,
     "autoPushInterval": 1,
     "autoPullOnBoot": true,
     "disablePush": false
   }
   ```

## Validation Notes

Before final integration, rerun:

```bash
bash scripts/test-obsidian-preflight.sh
bash scripts/test-obsidian-git-setup.sh
```

Manual Claude Code checks should use the local plugin directory:

```bash
claude --plugin-dir "$PWD" --effort low
```

Then run:

```text
/oh-my-obsidian:setup <vault-path>
```

For Obsidian Git `team-sync`, confirm that the target vault has both a remote and
an upstream tracking branch:

```bash
git -C "<vault-path>" remote -v
git -C "<vault-path>" branch -vv
```
