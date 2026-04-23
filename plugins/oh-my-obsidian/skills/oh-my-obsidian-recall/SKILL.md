# Oh My Obsidian Recall

Use this skill when the user asks about previous decisions, earlier fixes, past
session notes, troubleshooting history, or knowledge that should already exist
in the Obsidian vault.

## Contract

- Resolve the vault through the Codex resolver contract. If the vault does not
  resolve, stop and direct the user to the `oh-my-obsidian setup` skill.
- Do not mutate the vault.
- Search Markdown only.
- Exclude `.git`, `.obsidian`, and `.oh-my-obsidian`.
- Return concise excerpts with relative paths and categories.

## Helper

```bash
node scripts/vault-ops.mjs recall --query "<user query>"
```

## Expected Flow

1. Run the helper with the user’s query.
2. Review the returned excerpts.
3. Summarize only the relevant context.
4. Connect the recalled result to the user’s current question.

If no result is found, say so plainly and suggest a narrower or alternate query.
