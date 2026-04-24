---
name: session-save
description: >
  Save current session context and work summary to the Obsidian vault when the user asks to
  record or save their work. Automatically generates a structured markdown document capturing
  what was discussed, decisions made, and next steps.
  Triggers: 기록해, 저장해, save session, 세션 저장, 작업 기록, 이 작업 기록, save this,
  record this, 기록, 저장, 로그, log, document this, 회의록 작성, 정리해줘
version: 0.1.0
allowed-tools:
  - Bash
  - Read
  - Write
---

# Session Save Skill — 세션 기록 저장

## When to Activate
Activate when the user explicitly asks to save, record, or document the current session's work.
Also activate when the stop hook prompts and the user agrees to save.

## Steps

1. **Check Environment**
   Verify `$OBSIDIAN_VAULT` is set. If not, inform user and suggest `/oh-my-obsidian:setup`.

2. **Analyze Session**
   Review the conversation and extract:
   - Main topics discussed
   - Decisions made
   - Code/files modified
   - Problems solved
   - Action items or next steps

3. **Auto-Categorize**
   Determine the best category and derive the `type` field:
   - **작업기록/세션기록** → `type: session-log`: General work logs, coding sessions
   - **작업기록/의사결정** → `type: decision`: Architectural choices, design decisions
   - **작업기록/트러블슈팅** → `type: troubleshooting`: Bug fixes, error resolution
   - **작업기록/회의록** → `type: meeting-notes`: Meeting summaries (if multiple participants mentioned)
   - **서비스 레이어**: Technical knowledge docs (API specs, schemas, etc.)

4. **Discover Related Documents**
   Before writing the note, search the vault for related documents using grep/glob.
   Add any found documents as wikilinks in the 관련 문서 section.
   ```bash
   grep -ril "keyword1\|keyword2" "$OBSIDIAN_VAULT" --include="*.md"
   ```

5. **Generate Document**
   Create at: `$OBSIDIAN_VAULT/작업기록/{세션기록|의사결정|트러블슈팅}/YYYY-MM-DD_{slug}.md`

   Template:
   ```markdown
   ---
   date: YYYY-MM-DDTHH:mm
   topic: {inferred topic}
   category: {auto-detected category}
   type: {session-log|decision|troubleshooting|meeting-notes}
   services: [{affected services}]
   related_docs: [{auto-discovered wikilinks}]
   status: done
   tags: [auto-generated tags]
   ---

   # {topic}

   ## 요약
   {1-2 sentence summary}

   ## 상세 내용
   {detailed notes from session}

   ## 주요 결정
   - {decision 1}
   - {decision 2}

   ## 변경된 파일
   - `{file path}` — {what changed}

   ## 다음 단계
   - [ ] {action item}

   ## 관련 문서
   - [[{discovered-doc}]] -- (auto-discovered)
   ```

6. **Git Commit**
   ```bash
   cd "$OBSIDIAN_VAULT"
   git add "{category}/YYYY-MM-DD_{slug}.md"
   git commit -m "docs: {category} — {topic}"
   ```

7. **Confirm**
   Print: "✅ 저장 완료: {category}/{filename}"
   If the user said "session-save skip", exit silently without saving.

   Helper command with structural relationship flags:
   ```bash
   node scripts/vault-ops.mjs session-save \
     --topic "<topic>" \
     --detail "<summary>" \
     --category "세션기록" \
     --type "session-log" \
     --service "<service>" \
     --related-doc "<vault-relative-path>"
   ```
