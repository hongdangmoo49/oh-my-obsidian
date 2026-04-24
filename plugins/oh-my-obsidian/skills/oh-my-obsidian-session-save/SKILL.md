---
name: oh-my-obsidian-session-save
description: Use this skill when the user explicitly wants to save, record, or summarize the current session into the Obsidian vault.
---

# Oh My Obsidian Session Save

Use this skill when the user explicitly wants to save, record, or summarize the
current session into the Obsidian vault.

## Contract

- Mutating use requires a resolved vault with `setup-state.status == "complete"`.
- Never overwrite an existing note. Use exclusive create or a collision suffix.
- Save under `작업기록/<category>/YYYY-MM-DD_<slug>.md`.
- Inspect git status first.
- If unrelated staged, unstaged, or ambiguous git state exists, create the note
  but skip staging and commit, then report that clearly.
- If git is safe, stage only the created note, commit it, and verify the index
  is clear for that path after commit.
- If the resolver fails or setup is incomplete, surface the helper guidance and
  direct the user back to the `oh-my-obsidian setup` skill.

## Helper

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
