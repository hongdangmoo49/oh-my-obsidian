---
description: "Manage Obsidian vault — list contents, add documents, organize structure"
argument-hint: "<list|add|organize> [path]"
allowed-tools: Bash, Read, Write, Edit, Glob
---

## Context
- OBSIDIAN_VAULT: !`echo "${OBSIDIAN_VAULT:-not set}"`
- Vault tree: !`if [ -d "$OBSIDIAN_VAULT" ]; then find "$OBSIDIAN_VAULT" -maxdepth 2 -not -path "*/.obsidian/*" -not -path "*/.git/*" 2>/dev/null | head -50; else echo "Vault not configured"; fi`

## Your Task

Manage the Obsidian vault based on subcommand: {{ARGUMENTS}}

### `list` — 볼트 구조 보기
Show vault directory tree with file counts per category.

```
📂 {vault-name}/
├── 작업기록/     (N개 문서)
├── 의사결정/     (N개 문서)
├── 트러블슈팅/   (N개 문서)
├── 회의록/       (N개 문서)
├── 외부자료/     (N개 문서)
└── 가이드/       (N개 문서)

총 N개 문서
```

### `add` — 문서 추가
1. Ask for document content or file path
2. Ask for category (작업기록, 의사결정, 트러블슈팅, 회의록, 외부자료, 가이드)
3. Ask for title
4. Save to `$OBSIDIAN_VAULT/{category}/{title}.md` with frontmatter
5. Git commit

### `organize` — 문서 정리
1. Scan vault for uncategorized files
2. Auto-classify based on content analysis
3. Move files to appropriate categories
4. Show plan before executing
5. Git commit organized changes

### No argument
Show vault overview and suggest actions.
