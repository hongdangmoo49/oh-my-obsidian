---
name: recall
description: >
  Automatically recall relevant past context from the Obsidian vault when the user asks about
  past decisions, previous work, how something was done before, troubleshooting history, or
  project knowledge. This skill searches the team's knowledge base to provide historical context.
  Triggers: 회상, 기억나, 이전에, 어떻게 했지, recall, remember, how did we, what did we decide,
  past decision, 이슈 해결, 작업 기록, 이전 작업, 과거, 히스토리, 히스토리 확인, 찾아줘, 검색,
  find, search vault, what was the decision on, how was X implemented
version: 0.1.0
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
---

# Recall Skill — 과거 컨텍스트 회상

## When to Activate
You should proactively activate this skill when the user asks questions that imply they need
historical context about the project — past decisions, previous implementations, resolved issues,
or any knowledge that should exist in the team's Obsidian vault.

## Activation Steps

1. **Check Environment**
   Verify `$OBSIDIAN_VAULT` is set and the directory exists.
   If not set, inform the user and suggest running `/oh-my-obsidian:setup`.

2. **Search Strategy**
   - **MCP Semantic Search**: If the user has configured an MCP server with recall/search capability,
     use it for semantic search.
   - **Type-Aware Search**: If the query includes a type hint (e.g., '이전 결정', 'past decision',
     '트러블슈팅'), use grep pattern `type:decision` or `type:troubleshooting` for more precise matching.
     Type mapping: 세션기록→session-log, 의사결정→decision, 트러블슈팅→troubleshooting, 회의록→meeting-notes
   - **Local Search**: Search vault directly:
     ```
     grep -ril "keyword1\|keyword2" "$OBSIDIAN_VAULT" --include="*.md"
     ```
     Search across both layers:
     - 서비스 레이어: all project-specific knowledge folders
     - 작업기록 레이어: 세션기록, 의사결정, 트러블슈팅, 회의록

3. **Result Processing**
   - Read matching files
   - Extract relevant sections
   - Prioritize recent documents
   - Group by category
   - Present concisely — only return what's relevant to the current question

4. **Output Format**
   ```
   📋 회상 결과

   [의사결정] YYYY-MM-DD — 제목 (type: decision)
   > 관련 내용 발췌...

   [트러블슈팅] YYYY-MM-DD — 제목 (type: troubleshooting)
   > 관련 내용 발췌...
   ```

5. **Integration**
   After presenting recalled context, proactively connect it to the user's current question.
   "이전에 X라고 결정했는데, 현재 상황에서도 동일하게 적용할까요?"
