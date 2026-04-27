---
description: "과거 Claude Code / Codex 세션 기록을 vault에 구조화된 문서로 복원"
argument-hint: "[recent N | from YYYY-MM-DD to YYYY-MM-DD | all]"
allowed-tools: Bash, Read, Write, Glob, AskUserQuestion, Agent
---

## Context
- OBSIDIAN_VAULT: !`echo "${OBSIDIAN_VAULT:-not set}"`
- Current directory: !`node -e "console.log(process.cwd())"`
- Available projects (Claude Code): !`ls ~/.claude/projects/ 2>/dev/null | head -20`
- Codex sessions dir: !`node -e "const h=process.env.CODEX_HOME||require('path').join(require('os').homedir(),'.codex');const s=require('path').join(h,'sessions');require('fs').existsSync(s)?console.log(s):console.log('not found')"`
- Restore progress: !`cat "$OBSIDIAN_VAULT/작업기록/.restore-progress.json" 2>/dev/null || echo "none"`

## Your Task

You are the oh-my-obsidian history restore orchestrator.
Restore past AI coding tool (Claude Code and/or Codex) session transcripts into the Obsidian vault as structured documents.

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

### 0.3 AI Tool Detection

Automatically detect which AI coding tool session data is available:

1. **Claude Code**: Check if `~/.claude/projects/` exists and contains project directories.
2. **Codex**: Check if the Codex sessions directory exists:
   - If `$CODEX_HOME` is set: `$CODEX_HOME/sessions/`
   - Else platform default:
     - macOS / Linux / WSL: `~/.codex/sessions/`
     - Windows native: `%USERPROFILE%\.codex\sessions\`

Set detection flags: `HAS_CLAUDE_DATA`, `HAS_CODEX_DATA`.

If both are found, inform the user that both will be processed.
If neither is found:
- Print: "Claude Code 또는 Codex 세션 데이터를 찾을 수 없습니다."
- STOP.

### 0.4 Scope Selection

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

## Phase 1: Session Discovery & Catalog Build

### 1.1 Derive Scope Arguments

Based on the user's scope selection, prepare CLI arguments:
- Recent N: `--recent N`
- Date range: `--from YYYY-MM-DD --to YYYY-MM-DD`
- Current project: `--cwd <current directory>`
- All: (no filter flags)

### 1.2 Build Session Catalog (NEW — zero LLM tokens)

Run the pre-extraction script to build the session catalog:

```bash
node "${PLUGIN_ROOT}/plugins/oh-my-obsidian/scripts/transcript-preextract.mjs" scan \
  --vault "$OBSIDIAN_VAULT" \
  --source both \
  [--recent N] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--cwd "$CURRENT_DIR"]
```

This creates/updates `$OBSIDIAN_VAULT/.oh-my-obsidian/session-catalog.json` with
pre-extracted metadata for ALL discovered sessions — without any LLM processing.

Parse the JSON output. Key fields:
- `totalSessions` — total sessions discovered
- `claudeCodeSessions` — Claude Code session count
- `codexSessions` — Codex session count
- `emptySessions` — sessions with no substantive content
- `documentedSessions` — sessions that already have vault documents

If no sessions found (`totalSessions === 0`):
- Print: "복원할 세션이 없습니다."
- STOP.

### 1.3 Browse Catalog & Select Sessions (NEW)

Present the catalog summary to the user:
```
N개 세션 발견 (Claude Code: A개, Codex: B개).
빈 세션: C개, 이미 문서 있는 세션: D개.
```

Ask via AskUserQuestion:

```json
{
  "questions": [{
    "question": "카탈로그에서 문서를 생성할 세션을 선택하세요.",
    "header": "세션 선택",
    "multiSelect": false,
    "options": [
      {"label": "전체 생성", "description": "모든 N개 세션에 대해 문서를 생성합니다"},
      {"label": "문서 미생성 세션만", "description": "아직 문서가 없는 세션만 생성합니다"},
      {"label": "카탈로그만 유지", "description": "문서 생성 없이 카탈로그만 유지합니다"},
      {"label": "세션별 선택", "description": "카탈로그를 보여주고 개별 세션을 선택합니다"}
    ]
  }]
}
```

If "카탈로그만 유지" → skip to Phase 3 (finalization).
If "세션별 선택" → read the catalog, show session list with dates and firstUserMessage,
  then ask the user to specify which session numbers to process.

Record the selection as `SELECTED_SESSIONS`.

### 1.4 Confirm with User

Present summary: "N개의 세션에서 문서를 생성합니다. 처리를 시작할까요?"

---

## Phase 2: Batch Processing Loop

**HARD LIMITS:**
- Maximum 10 sessions per batch (pre-extracted data is compact, ~3-5KB each)
- Maximum 50KB total pre-extracted data per batch

### For each batch:

#### Step A: Read Pre-Extracted Data from Catalog

Read `$OBSIDIAN_VAULT/.oh-my-obsidian/session-catalog.json` and extract the
pre-extracted session data for the sessions in the current batch.

The pre-extracted data contains:
- `firstUserMessage`, `lastUserMessage` — for topic inference
- `toolsUsed` — tool names used in the session
- `filesModified` — file paths modified
- `errorSignals` — detected error patterns
- `userMessageCount`, `assistantTurnCount`
- `isEmptySession` — whether the session has substantive content

No need to read raw JSONL files — all needed data is in the catalog.

#### Step B: Spawn Summarizer Subagent (REDUCED INPUT)

```
Agent(
  description="세션 사전 추출 데이터 요약",
  prompt="""
  You are the transcript-summarizer agent.
  Read your agent definition at ${CLAUDE_PLUGIN_ROOT}/agents/transcript-summarizer.md first.

  IMPORTANT: You are receiving PRE-EXTRACTED data (Format A), not raw JSONL.
  The mechanical parsing has already been done by a Node.js script.
  Focus ONLY on judgment tasks: topic, summary, categorization, decisions.

  PRE-EXTRACTED SESSION DATA:
  {JSON array of pre-extracted session objects from catalog, ~3-5KB each}

  For EACH session, generate a summary in the JSON format specified in your agent definition.
  Use the pre-extracted data to inform your judgments:
  - firstUserMessage → determine the topic
  - errorSignals + toolsUsed → categorization (트러블슈팅 > 의사결정 > 세션기록)
  - errorSignals → errorsEncountered
  - filesModified → pass through as-is
  - toolsUsed → pass through as-is
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
restoredFrom: pre-extracted
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
   If not a git repo, skip the git add step.

#### Step D: Update Catalog

For each generated document, update the session entry in `session-catalog.json`:
- Set `documentGenerated: true`
- Set `documentPath: "작업기록/{category}/YYYY-MM-DD_{slug}.md"`
- Set `topic` and `category` from the LLM response

#### Step E: Update Progress File

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
  "catalogBuilt": true,
  "status": "in_progress"
}
```

#### Step F: Report Progress

Print: "진행: X/N 세션 처리 완료 (세션기록: A, 의사결정: B, 트러블슈팅: C)"

#### Step G: Loop

Continue to next batch until all selected sessions are processed.

---

## Phase 3: Finalization

### 3.1 Git Commit

Check if vault is a git repository: `git -C "$OBSIDIAN_VAULT" rev-parse --is-inside-work-tree 2>/dev/null`

If git repo AND any files were generated:
```bash
cd "$OBSIDIAN_VAULT"
git add "작업기록/" ".oh-my-obsidian/session-catalog.json"
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
  - Claude Code: A개
  - Codex: B개
생성된 문서:
  - 세션기록: X개
  - 의사결정: Y개
  - 트러블슈팅: Z개
건너뛴 세션: W개 (내용 없음)
카탈로그: session-catalog.json 업데이트됨
```

If no sessions were found or all were empty:
```
복원할 세션이 없습니다.
지정한 범위에 처리 가능한 세션이 없습니다.
```

If user selected "카탈로그만 유지":
```
카탈로그가 생성되었습니다: N개 세션 메타데이터
나중에 restore-history를 다시 실행하여 개별 세션의 문서를 생성할 수 있습니다.
```
