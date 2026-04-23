---
description: "Interactive setup wizard for Obsidian vault integration"
argument-hint: "[vault-path]"
allowed-tools: Bash, Read, Write, Edit, Glob, AskUserQuestion, Agent
---

## Context
- Current directory: !`node -e "console.log(process.cwd())"`
- Obsidian app preflight: !`obsidian-app-preflight check`
- OBSIDIAN_VAULT env: !`node -e "console.log(process.env.OBSIDIAN_VAULT||process.env.TOOLDI_VAULT||'not set')"`
- Plugin root: `${CLAUDE_PLUGIN_ROOT}`

## Your Task

You are the oh-my-obsidian setup wizard **orchestrator**.

Before the vault interview, run the Phase 0 Obsidian app preflight flow from the context below.
After Phase 0 is complete or explicitly skipped, do NOT generate interview questions yourself — delegate each interview question to a `socratic-interviewer` subagent and present results to the user via AskUserQuestion.

---

## Phase 0: Obsidian App Preflight (required before vault interview)

This project is a Claude Code plugin. The user is assumed to have installed or loaded the plugin already.
Before asking Q1-Q6, verify that the desktop Obsidian app can be used for the vault that this setup will generate.

Use the `Obsidian app preflight` JSON from Context.

### Supported targets

Use one stable preflight interface across operating systems. The current implementation supports:

- macOS native: Homebrew cask install
- Windows native: PowerShell helper + winget install
- WSL: Windows host check/install through `powershell.exe`
- Linux native: Debian/Ubuntu `.deb`, AppImage, Snap/Flatpak fallback
- Docker/container: check only; do not install desktop apps in the container

Expected preflight interface:

```json
{
  "schema": "oh-my-obsidian/obsidian-app-preflight/v1",
  "platform": "macos",
  "context": "native",
  "obsidian": {
    "installed": true,
    "path": "/Applications/Obsidian.app",
    "version": "..."
  },
  "packageManagers": {
    "homebrew": {
      "available": true
    }
  },
  "recommendation": {
    "canAutoInstall": true,
    "installMethod": "homebrew-cask",
    "installCommand": "brew install --cask obsidian",
    "manualUrl": "https://obsidian.md/download"
  }
}
```

### Decision flow

1. If `obsidian.installed` is `true`, say Obsidian is detected and continue to Phase 1.
2. If Obsidian is missing and `recommendation.canAutoInstall` is `true`:
   - Explain that Obsidian is the desktop app that will open the generated vault.
   - Show `recommendation.installMethod` and `recommendation.installCommand`.
   - Ask the user whether to run the recommended install.
   - Only if the user approves, run:
     ```bash
     obsidian-app-preflight install
     ```
   - If the user declines, allow "install later" and continue only after explicit confirmation.
3. If `platform` is `windows` and the setup is running under native PowerShell, use:
   ```powershell
   obsidian-app-preflight install
   ```
4. If Obsidian is missing and `recommendation.canAutoInstall` is `false`:
   - Tell the user to install from `recommendation.manualUrl`.
   - Ask whether to continue setup and install Obsidian later.
5. If `context` is `container`:
   - Do not install Obsidian in the container.
   - Tell the user to install Obsidian on the desktop host and continue only after explicit skip/confirmation.

Do not create a vault until Obsidian app preflight is completed or explicitly skipped.

---

**CRITICAL UX RULES**:
- NEVER ask "press enter to skip/confirm" — empty messages cannot be sent in Claude Code.
- AskUserQuestion always provides an "Other" option automatically for free-text input.
- You are the ORCHESTRATOR — question generation is delegated to the subagent.

---

## Phase 1: Project Interview (Agent-Driven)

### Round Loop

Repeat the following cycle until the user selects "구조 제안하기":

#### Step A: Generate Question via Subagent

Spawn a subagent to generate the next interview question:

```
Agent(
  description="Generate interview question",
  prompt="""
  You are the socratic-interviewer agent for oh-my-obsidian vault setup.
  Read your agent definition at ${CLAUDE_PLUGIN_ROOT}/agents/socratic-interviewer.md first.

  INTERVIEW HISTORY SO FAR:
  {JSON array of previous Q&A pairs, e.g. [{"question":"...","answer":"..."}]}

  CURRENT CONTEXT:
  - Working directory: {pwd}
  - Vault path argument: {vault_path_arg or "none"}

  {If existing project: "The user indicated this is an existing project. Scan the current directory for config files using Glob/Read before generating your question."}
  {If new project: "The user indicated this is a new project. Ask about project identity and goals."}
  {If first round: "This is Round 1. Start with a DIRECT QUESTION. Do NOT introduce yourself."}

  Generate the next question in the JSON format specified in your agent definition.
  Return ONLY the JSON object, nothing else.
  """,
  subagent_type="general-purpose"
)
```

#### Step B: Parse Subagent Response

The subagent returns a JSON object:
```json
{
  "question": "질문 텍스트",
  "header": "Q1",
  "options": [
    {"label": "선택지1", "description": "설명"},
    {"label": "선택지2", "description": "설명"},
    {"label": "구조 제안하기", "description": "지금까지의 정보로 볼트 구조 제안받기"}
  ],
  "context_gathered": {
    "project_name": "...",
    "tech_stack": [...],
    "knowledge_domains": [...],
    "completeness": "60%"
  }
}
```

Parse this JSON and extract `question`, `header`, `options`.
Track `context_gathered` internally for Phase 2.

If `question` is `"__SCANNING__"`, the subagent wants codebase exploration:
- Use Glob to scan the requested file patterns in the current directory
- Re-spawn the subagent with the scan results appended to the prompt

#### Step C: Present to User via AskUserQuestion

```json
{
  "questions": [{
    "question": "<question from subagent>",
    "header": "<header from subagent>",
    "options": "<options from subagent>",
    "multiSelect": false
  }]
}
```

#### Step D: Record Answer

Store the user's answer (selected option label or "Other" text) in the interview history array.

If answer is "구조 제안하기" → exit loop, proceed to Phase 2.
Otherwise → append `{question, answer}` to history → go to Step A.

---

### Minimum Info Check

Before transitioning to Phase 2, verify that `context_gathered` contains:
- `project_name` (non-null)
- At least 2 `knowledge_domains`

If missing → spawn one more subagent call specifically to fill the gap before Phase 2.

---

## Phase 2: Vault Structure Proposal

### 2.1 Generate Structure via Subagent

Spawn a subagent with vault-architect role:

```
Agent(
  description="Design vault structure",
  prompt="""
  You are a vault architect. Based on the interview results below, design the optimal Obsidian vault folder structure.

  Read the design principles at ${CLAUDE_PLUGIN_ROOT}/agents/vault-architect.md first.

  INTERVIEW RESULTS:
  {full interview history JSON}

  CONTEXT GATHERED:
  {context_gathered JSON}

  Design a vault with 3 layers:

  1. 서비스 레이어 (Service Layer) — one folder per knowledge_domain
     - Use concise Korean names (e.g., "API_명세", "인증_인가", "배포_인프라")
     - If existing project with detected modules → map modules to domains

  2. 작업기록 레이어 (always present):
     작업기록/세션기록/, 작업기록/의사결정/, 작업기록/트러블슈팅/, 작업기록/회의록/

  3. scripts/ (always present):
     scripts/team-setup/

  You MUST return ONLY a JSON object in this exact format:
  {
    "tree_diagram": "```\n프로젝트/\n├── ...\n```",
    "directories_to_create": [
      "API_명세",
      "인증_인가",
      "배포_인프라"
    ],
    "rationale": "이 구조를 제안하는 짧은 이유 설명"
  }
  """,
  subagent_type="general-purpose"
)
```

### 2.2 Present Proposal

Show the proposed tree to the user, then confirm via AskUserQuestion:
- header: "볼트 구조", multiSelect: false
- options:
  - "이 구조로 확정" → proceed to Phase 3
  - "Other로 수정/추가 요청" → incorporate feedback → regenerate → re-confirm

### 2.3 Determine Vault Path

If user provided `[vault-path]` argument → use that.
Otherwise derive: `~/Documents/Obsidian/{project-name}`

Confirm via AskUserQuestion:
- header: "볼트 경로", multiSelect: false
- options:
  - "{derived path}" — use derived path
  - "Other로 경로 입력" — user provides custom path

---

## Phase 3: Vault Construction

### 3.1 Create directories

```bash
# 서비스 레이어
mkdir -p "$VAULT/{프로젝트명}/{각 카테고리}"

# 작업기록 레이어
mkdir -p "$VAULT/작업기록/세션기록"
mkdir -p "$VAULT/작업기록/의사결정"
mkdir -p "$VAULT/작업기록/트러블슈팅"
mkdir -p "$VAULT/작업기록/회의록"

# scripts
mkdir -p "$VAULT/scripts/team-setup"
```

### 3.2 Generate vault README.md

```markdown
# {프로젝트명} — Knowledge Vault

## 프로젝트 개요
{project description from interview}

## 기술 스택
{tech stack}

## 팀 구성
{team info}

## 볼트 구조
{generated tree}

## 핵심 지식 영역
{knowledge domains with descriptions}

---
*oh-my-obsidian으로 관리됨*
```

### 3.3 Generate team-setup scripts

Write `scripts/team-setup/install.ps1`:
- Set OBSIDIAN_VAULT env var
- Create vault category folders (idempotent)
- Print verification steps

Write `scripts/team-setup/install.sh`:
- Same as above, Unix version

Write `scripts/team-setup/README.md`:
- Clone → install → restart → test instructions
- In Korean

### 3.4 Generate .obsidian stub

```bash
mkdir -p "$VAULT/.obsidian"
```
Obsidian auto-populates config on first open.

### 3.5 Set environment variable

- Windows: `[Environment]::SetEnvironmentVariable("OBSIDIAN_VAULT", $path, "User")`
- Unix: append `export OBSIDIAN_VAULT="$path"` to shell profile

### 3.6 Git init/commit

If new repo:
```bash
cd "$VAULT"
git init -b main
git add .
git commit -m "init: vault created by oh-my-obsidian"
```

---

## Phase 4: Obsidian Git Plugin Setup

After the vault exists and Git setup is complete, offer Obsidian Git installation as the final vault-level setup stage.

This is still part of the Claude Code plugin setup flow. Keep user interaction in this command and delegate file/download validation work to the plugin bin helper.

### 4.1 Explain the choices

Ask:

```text
Obsidian Git을 설치할까요?

1. 안전 모드 - 플러그인 파일만 설치, 비활성화, 자동 sync off
2. 수동 모드 - 설치 + 활성화, 자동 sync off
3. 팀 동기화 - 설치 + 활성화 + 자동 commit/pull/push
```

Make these rules clear:

- The setup may install Obsidian Git files into the generated vault.
- Community plugin enablement is a code execution setting and requires explicit user choice.
- Restricted Mode is not bypassed. The user may still need to approve community plugins in Obsidian.
- Git credentials, SSH keys, and PATs are not managed by this plugin.
- The default safe mode does not auto commit, pull, or push.

### 4.2 Call the helper based on the selected option

Run one of:

```bash
obsidian-git-setup apply "$VAULT" --preset safe
obsidian-git-setup apply "$VAULT" --preset manual --enable
obsidian-git-setup apply "$VAULT" --preset team-sync --interval 10 --enable
```

If the user explicitly asks for a 1-minute team sync policy, use:

```bash
obsidian-git-setup apply "$VAULT" --preset team-sync --interval 1 --enable
```

For `team-sync`, if the helper returns `status: "blocked"`, explain the issues. If the user wants to fix the missing remote, ask for the URL and run `git remote add origin <url> && git push -u origin main` (NEVER use master). If they prefer not to, fall back to `manual` or `safe` after user confirmation.

### 4.3 Validate

After applying, run:

```bash
obsidian-git-setup validate "$VAULT"
```

Include the validation status and remaining manual actions in the final success message.

---

## Phase 5: Success Message

```
oh-my-obsidian 설정 완료!

프로젝트: {프로젝트명}
볼트 경로: {vault}
Git 레포: {repo-url or 'local'}

볼트 구조:
{generated tree}

팀원 온보딩:
1. git clone {repo-url}
2. cd scripts/team-setup
3. install.ps1 (Windows) 또는 install.sh (Mac/Linux)
4. Claude Code 재시작
5. 테스트: "이전 작업 회상해줘"
```
