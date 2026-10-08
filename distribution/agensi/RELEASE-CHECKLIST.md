# Free basic distribution candidate

Price: USD 0. License: MIT. No paid tier, subscription, or activation key.
Target agents: Codex CLI and Claude Code only.

## Build and verification

Run from the repository root on Windows with Node 22+ and Windows PowerShell:

```text
node distribution/agensi/build.mjs
node distribution/agensi/test.mjs
node --test plugins/oh-my-obsidian/tests/*.test.mjs
```

Output: dist/oh-my-obsidian-free-0.3.7-candidate-<payload-id>.zip and its .sha256 file.
Existing ZIPs are never overwritten. Use --output-dir for an isolated build.
The ZIP has SKILL.md at its root, MIT license, instructions, native manifests,
shared helpers, hook runner, and templates. PACKAGE.json inventories file hashes.
Legacy installers, private settings, vault notes, tests and Git data are excluded.
The test command uses temporary agent configuration, not installed user settings.

Verified on Windows, Node 24.13.1, Codex 0.160.0, Claude Code 2.1.156:

- ZIP extraction, forward-slash entry paths and all payload hashes.
- Claude marketplace and plugin manifest validation without warnings.
- Native local marketplace registration and plugin install in both CLIs.
- Extracted runtime checks run with cwd fixed to the extracted root. A deliberate
  broken-helper control must fail, and injected local environment/private files
  must not appear in the ZIP. The earlier 41-pass result included original-source
  tests and is not sufficient artifact-level evidence.
- Runtime coverage includes real note writes,
  recall, Claude turn-id variants, quiet Stop and Codex hook registration.
- After the 0.3.7 adversarial-review fixes: extracted runtime 55 passed, 1 skipped,
  0 failed; full source regression 104 passed, 9 skipped, 0 failed. Re-run before
  release; these are local integration checks, not model-session E2E evidence.

## Gates before public upload

- Verify the current release PR is merged and the release points to that commit.
- Complete a real authenticated Claude model-session smoke test before promoting
  the candidate as production-verified. The 2026-10-08 retry still failed with
  authentication errors; local tests are not a substitute.
- Run a fresh Codex model-session smoke test against this distribution artifact.
  The 2026-10-08 source-branch smoke passed; this is not artifact-level E2E confirmation.
- Review skipped platform tests; macOS/Linux are not verified by this build.
- Confirm Agensi's current upload/license terms and inspect its preview/security
  review. Do not claim generic skill extraction activates native hooks.
- Rebuild, rerun checks and retain the final artifact checksum before uploading.

## Suggested listing copy

Title: Oh My Obsidian Free - Local Project Memory

Description: Keep concise project work summaries, decisions and next steps in
your own Obsidian vault. Recall previous decisions from local Markdown and enable
best-effort session saving with approved native hooks for Codex CLI or Claude
Code. Free and MIT licensed. Requires your own working agent installation;
model usage charges are separate. Native plugin registration and vault approval
are required. No raw transcript archiving or automatic Git commits.

Do not publish this candidate as fully verified while the gates remain open.
