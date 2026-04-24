---
name: oh-my-obsidian-recall
description: Use this skill when the user asks about previous decisions, earlier fixes, past session notes, troubleshooting history, or knowledge that should already exist in the Obsidian vault.
---

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
   - **Type-Aware Search**: If the query includes a type hint (e.g., ‘이전 결정’, ‘past decision’,
     ‘트러블슈팅’), use grep pattern `type:decision` or `type:troubleshooting` for more precise matching.
     Type mapping: 세션기록→session-log, 의사결정→decision, 트러블슈팅→troubleshooting, 회의록→meeting-notes
2. Review the returned excerpts.
3. Summarize only the relevant context. Include the `type` field in the output.
4. Connect the recalled result to the user’s current question.

Output format should include the type field:
```
📋 회상 결과

[의사결정] YYYY-MM-DD — 제목 (type: decision)
> 관련 내용 발췌...

[트러블슈팅] YYYY-MM-DD — 제목 (type: troubleshooting)
> 관련 내용 발췌...
```

If no result is found, say so plainly and suggest a narrower or alternate query.
