---
name: obsidian-vault-manager
description: >
  Manage the Obsidian vault structure, organize documents, add new files, and maintain the
  team's knowledge base. Use this skill when the user wants to organize, categorize, or
  restructure their vault contents, or when adding new documents that need proper placement.
  Triggers: vault, 볼트, 문서 정리, 분류, organize vault, add document, 정리해, vault structure,
  vault 관리, 볼트 구조, 카테고리, 폴더 정리, 문서 추가, organize, categorize, knowledge base,
  지식 베이스, 노트 정리
version: 0.1.0
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
---

# Obsidian Vault Manager Skill — 볼트 관리

## When to Activate
Activate when the user wants to manage vault structure, organize documents, add new content,
or maintain the knowledge base.

## Vault Structure

The vault has 3 layers (determined during setup):

### 서비스 레이어 — project-specific
Dynamically generated folders based on the project's knowledge areas.
Common examples: API/, 인증/, 배포/, 비즈니스로직/, 스키마/

### 작업기록 레이어 — always present
- **작업기록/세션기록/** — Work session logs
- **작업기록/의사결정/** — Decision records (ADR style)
- **작업기록/트러블슈팅/** — Problem/solution records
- **작업기록/회의록/** — Meeting notes and summaries

## Operations

### Add Document
1. Determine content from user input or file
2. Analyze content to auto-detect category
3. Generate appropriate filename: `YYYY-MM-DD_{slug}.md`
4. Add frontmatter with metadata
5. Save to appropriate location: 서비스 레이어 or `$OBSIDIAN_VAULT/작업기록/{category}/`
6. Git add + commit

### Organize
1. Scan vault for misplaced files (root level, wrong category)
2. Analyze content to determine correct category
3. Present reorganization plan to user
4. Execute approved moves
5. Update any internal links
6. Git commit

### Meeting Notes Processing
When processing meeting notes:
1. Extract date, participants, topics
2. Identify decisions → save to 의사결정/
3. Identify action items → include in 작업기록/
4. Identify problems discussed → save to 트러블슈팅/
5. Save original notes to 회의록/
6. Cross-reference with existing vault documents

### Health Check
- Check for orphaned files (not in any category)
- Check for duplicate content
- Verify git status is clean
- Report vault statistics (total docs per category)
