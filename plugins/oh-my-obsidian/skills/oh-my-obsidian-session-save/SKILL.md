---
name: oh-my-obsidian-session-save
description: Use this skill when the user wants to save the current session or the installed Stop hook requests automatic summary saving.
---

# Oh My Obsidian Session Save

Use this skill when the user explicitly wants to save, record, or summarize the
current session into the Obsidian vault, or an installed Stop hook requests it.

## Contract

- Mutating use requires a resolved vault with `setup-state.status == "complete"`.
- Never overwrite an existing note. Use exclusive create or a collision suffix.
  Exception: automatic mode updates only its own session-id-marked note.
- For a Stop-hook automatic save, use the hook-supplied helper and
  `--auto-session-id "<session-id>"`. Pass the hook-supplied
  `--auto-turn-id "<turn-id>"` when available so Stop can verify this response.
  For an existing note, pass
  `--expected-note-hash "<hash>"` for an existing note. Save new work, decisions,
  and next steps only; never copy raw conversation, secrets, or personal data.
  Read the existing automatic note before summarizing; the helper appends
  updates, retaining its prior content. User edits and stale or concurrent
  updates are rejected rather than overwritten. Do not bypass a conflict.
  Automatic saves never commit or
  push. If saving fails, report it once and finish without a retry loop.
- For a response with no new work, run `session-skip` with the supplied session
  and turn ids instead of inventing a summary. A skip receipt is not a saved
  work record. `session-status` with the same ids verifies the receipt and
  actual note hash; a nonzero exit means completion was not verified.
- Save work records, including troubleshooting, under
  `작업기록/<category>/YYYY-MM/YYYY-MM-DD/<slug>.md`.
- Use the machine's local calendar date, not UTC, for new records.
- Inspect git status first.
- If unrelated staged, unstaged, or ambiguous git state exists, create the note
  but skip staging and commit, then report that clearly.
- If git is safe, stage only the created note, commit it, and verify the index
  is clear for that path after commit.
- If the resolver fails or setup is incomplete, surface the helper guidance and
  direct the user back to the `oh-my-obsidian setup` skill.

## Helper

Automatic save metadata has a verified backup and a pending-transaction journal.
Corrupt state is restored only when its backup matches the owned note. A pending
save is finalized or rolled back by comparing the note hash; user edits are
never overwritten during recovery.

After a reported abandoned lock, request approval before running:

```bash
node scripts/vault-ops.mjs session-recover --auto-session-id "<session-id>"
```

Recovery refuses live, foreign-host/platform, and unidentified lock owners.
It never creates a summary, commits, or pushes. If recovery is refused, report
the reason; do not delete a lock or fabricate replacement metadata.

```bash
node scripts/vault-ops.mjs session-save \
  --topic "<topic>" \
  --detail "<summary>" \
  --category "세션기록"
```

Optional repeated flags:

- `--decision "<item>"`
- `--next-step "<item>"`
- `--file "<path>"`
- `--participant "<name>"`
- `--tag "<tag>"`
- `--type "<type>"` — auto-derived from category if omitted (session-log|decision|troubleshooting|meeting-notes)
- `--service "<service>"` — repeated, names of affected services
- `--related-doc "<path>"` — repeated, vault-relative path to auto-discover as wikilink

## Expected Flow

1. Derive a concise topic and summary from the session.
2. Choose the category:
   - `세션기록`
   - `의사결정`
   - `트러블슈팅`
   - `회의록`
3. Run the helper. If related documents are discovered in the vault, pass them as `--related-doc` flags.
4. Tell the user where the note was written and whether git commit was skipped
   or completed.
5. If the helper returns setup guidance instead of writing, stop and route the
   user to the setup skill instead of improvising a fallback mutation.
