---
description: "과거 Claude Code 세션 기록을 vault에 구조화된 문서로 복원"
argument-hint: "[recent N | from YYYY-MM-DD to YYYY-MM-DD | all]"
allowed-tools: Bash, Read, Write, Glob, AskUserQuestion, Agent
---

## Context
- OBSIDIAN_VAULT: !`echo "${OBSIDIAN_VAULT:-not set}"`
- Current directory: !`node -e "console.log(process.cwd())"`
- Available projects: !`ls ~/.claude/projects/ 2>/dev/null | head -20`
- Restore progress: !`cat "$OBSIDIAN_VAULT/작업기록/.restore-progress.json" 2>/dev/null || echo "none"`

## Your Task

You are the oh-my-obsidian history restore orchestrator.
Restore past Claude Code session transcripts into the Obsidian vault as structured documents.

**CRITICAL UX RULES**:
- NEVER ask "press enter to skip/confirm" — empty messages cannot be sent in Claude Code.
- AskUserQuestion always provides an "Other" option automatically for free-text input.

---

## Phase 0: Preflight & Scope Selection

### 0.1 Vault Check

If OBSIDIAN_VAULT is "not set" or the directory does not exist:
- Print: "OBSIDIAN_VAULT가 설정되지 않았습니다. 먼저 /oh-my-obsidian:setup을 실행하세요."
- STOP. Do not continue.

### 0.2 Progress File Check

Read `$OBSIDIAN_VAULT/작업기록/.restore-progress.json` if it exists.
If found and status is "in_progress":
- Note the existing scope and processed count for the resume option.

### 0.3 Scope Selection

Ask the user via AskUserQuestion:

```json
{
  "questions": [{
    "question": "복원할 세션 범위를 선택하세요.",
    "header": "복원 범위",
    "multiSelect": false,
    "options": [
      {"label": "최근 N개 세션", "description": "가장 최근 N개의 세션만 복원합니다"},
      {"label": "기간 지정", "description": "시작일과 종료일을 지정하여 복원합니다"},
      {"label": "현재 프로젝트 전체", "description": "현재 작업 디렉토리와 관련된 모든 세션을 복원합니다"},
      {"label": "전체 프로젝트", "description": "모든 프로젝트의 모든 세션을 복원합니다"}
    ]
  }]
}
```

If progress file exists, add option: `{"label": "이전 복원 이어하기", "description": "X/Y 세션 처리 완료, 나머지 계속"}`

If user selects "최근 N개" → ask for N via AskUserQuestion (header: "세션 수").
If user selects "기간 지정" → ask for from/to dates via AskUserQuestion.

---

## Phase 1: Session Discovery

### 1.1 Derive Project Hash

Convert the current working directory to the Claude Code project hash:
1. Replace all `\` with `/` (normalize to forward slashes)
2. Replace all `/` and `:` with `-`
- Example: `C:\Users\Admin\workspace\foo` → `C:/Users/Admin/workspace/foo` → `C--Users-Admin-workspace-foo`

If user selected "전체 프로젝트", skip filtering and scan all project directories.

### 1.2 List Transcript Files

For a specific project:
```bash
ls -lh ~/.claude/projects/{hash}/*.jsonl 2>/dev/null
```
Note: exclude files inside `subagents/` subdirectories.

For all projects:
```bash
find ~/.claude/projects/ -maxdepth 2 -name "*.jsonl" -not -path "*/subagents/*" 2>/dev/null
```

### 1.3 Cross-Reference with History

Read `~/.claude/history.jsonl` (lightweight, safe to read in full).
If the file does not exist, proceed without metadata (use file modification times only).

Group entries by sessionId to get:
- Timestamps for each session
- User prompt previews

### 1.4 Filter by Scope

Apply the user's scope selection:
- **Recent N**: sort by timestamp descending, take top N
- **Date range**: filter by timestamp within [from, to]
- **Current project**: already filtered by hash
- **All**: no filter

Skip files smaller than 1KB (trivially short sessions with no useful content).

### 1.5 Confirm with User

Present summary: "N개의 세션을 발견했습니다 (총 SIZE). 처리를 시작할까요?"

---

## Phase 2: Batch Processing Loop

**HARD LIMITS:**
- Maximum 2 transcript files per batch
- Maximum 300KB total per batch (Korean text has high token density)
- If a single file exceeds 300KB, process it alone in one batch

### For each batch:

#### Step A: Read Transcript Files

Use the Read tool to read the next batch of transcript files.
If a file is too large to read in one pass, read the first 300KB only and note truncation.

#### Step B: Spawn Summarizer Subagent

```
Agent(
  description="세션 트랜스크립트 요약",
  prompt="""
  You are the transcript-summarizer agent.
  Read your agent definition at ${CLAUDE_PLUGIN_ROOT}/agents/transcript-summarizer.md first.

  SESSION METADATA:
  {JSON with sessionId, timestamps, user prompts for this batch}

  TRANSCRIPT CONTENT:
  {raw transcript content from the batch}

  For EACH session, generate a summary in the JSON format specified in your agent definition.
  Return ONLY the JSON object with sessions array.
  """,
  subagent_type="general-purpose"
)
```

#### Step C: Parse and Save

Parse the subagent's JSON response. For each session in the `sessions` array:

If `isEmptySession` is true: skip, add to skippedSessions in progress file.

Otherwise:

1. Determine target directory: `$OBSIDIAN_VAULT/작업기록/{category}/`
2. Generate filename: `YYYY-MM-DD_{slug}.md`
3. Check for duplicate: if file exists, append `-2`, `-3`, etc.
4. Write the document using this template:

```markdown
---
date: {date} {startTime}
topic: {topic}
category: {category}
participants: Claude + User
sessionId: {sessionId}
restoredFrom: transcript
---

# {topic}

## 요약
{summary}

## 주요 결정
{for each decision: "- {decision}"}
{if empty: "이 세션에서 특별한 결정은 없었습니다."}

## 발생한 에러
{for each error: "- {error}"}
{if empty: omit this section}

## 수정된 파일
{for each file: "- {path}"}
{if empty: omit this section}

## 사용된 도구
- {comma-separated tool list}

## 다음 단계
{for each step: "- [ ] {step}"}
{if empty: omit this section}
```

5. If vault is a git repository, run: `git -C "$OBSIDIAN_VAULT" add "작업기록/{category}/YYYY-MM-DD_{slug}.md"`
   If not a git repo, skip the git add step — files are still saved to disk.

#### Step D: Update Progress File

Write to `$OBSIDIAN_VAULT/작업기록/.restore-progress.json`:

```json
{
  "schema": "oh-my-obsidian/restore-progress/v1",
  "scope": "{user's scope description}",
  "startedAt": "{ISO timestamp of first batch}",
  "lastUpdatedAt": "{ISO timestamp of this update}",
  "totalSessions": N,
  "processedSessions": ["sessionId1", "sessionId2"],
  "skippedSessions": [{"id": "sessionId", "reason": "empty"}],
  "generatedFiles": ["relative/path/to/file.md"],
  "status": "in_progress"
}
```

#### Step E: Report Progress

Print: "진행: X/N 세션 처리 완료 (세션기록: A, 의사결정: B, 트러블슈팅: C)"

#### Step F: Loop

Continue to next batch until all sessions are processed.

---

## Phase 3: Finalization

### 3.1 Git Commit

Check if vault is a git repository: `git -C "$OBSIDIAN_VAULT" rev-parse --is-inside-work-tree 2>/dev/null`

If git repo AND any files were generated:
```bash
cd "$OBSIDIAN_VAULT"
git add "작업기록/"
git commit -m "restore: N개 과거 세션 기록 복원"
```

If not a git repo:
- Files are already saved to disk. No git commit needed.
- Print: "N개 문서가 볼트에 저장되었습니다. (Git 미사용 — 나중에 git init으로 관리할 수 있습니다)"

If git working tree is dirty (uncommitted changes from another source):
- Warn the user and ask whether to commit alongside existing changes
- NEVER force commit or stash without user consent

### 3.2 Cleanup Progress File

Delete `$OBSIDIAN_VAULT/작업기록/.restore-progress.json`.
Update status to "completed" first, then delete.

### 3.3 Success Message

```
과거 세션 복원 완료!

처리된 세션: N개
생성된 문서:
- 세션기록: X개
- 의사결정: Y개
- 트러블슈팅: Z개
건너뛴 세션: W개 (내용 없음)
```

If no sessions were found or all were empty:
```
복원할 세션이 없습니다.
지정한 범위에 처리 가능한 세션이 없습니다.
```
