---
description: "Search and recall past documents, decisions, and troubleshooting from the vault"
argument-hint: "<query>"
allowed-tools: Bash, Read, Glob, Grep
---

## Context
- OBSIDIAN_VAULT: !`echo "${OBSIDIAN_VAULT:-not set}"`
- Vault contents: !`if [ -d "$OBSIDIAN_VAULT" ]; then find "$OBSIDIAN_VAULT" -name "*.md" -not -path "*/.obsidian/*" -not -path "*/.git/*" 2>/dev/null | head -30; else echo "Vault not found"; fi`

## Your Task

Search the Obsidian vault for relevant past context matching the user's query: {{ARGUMENTS}}

### Search Strategy

1. **MCP Semantic Search (if available)**
   If the user has configured an MCP server with recall/semantic search capability, use it.

2. **Local Search**
   Search the vault directly using grep/glob:
   - Search filenames matching keywords
   - Search file contents with grep
   - Check all categories: 작업기록, 의사결정, 트러블슈팅, 회의록, 외부자료, 가이드

3. **Return Results**
   For each match found, provide:
   - File path (relative to vault)
   - Relevant excerpt
   - Date (from file modification time or frontmatter)
   - Category

### Output Format

```
📋 회상 결과 — "{{ARGUMENTS}}"

관련 문서 N개 발견:

1. [카테고리] 파일명 (날짜)
   > 관련 내용 발췌

2. ...
```

If nothing found: "관련 문서를 찾지 못했습니다. 다른 키워드로 검색해보세요."
