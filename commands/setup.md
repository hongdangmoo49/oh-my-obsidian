---
description: "Interactive setup wizard for Obsidian vault integration"
argument-hint: "[vault-path]"
allowed-tools: Bash, Read, Write, Edit, Glob, AskUserQuestion
---

## Context
- Current directory: !`node -e "console.log(process.cwd())"`
- Obsidian app preflight: !`obsidian-app-preflight check`
- OBSIDIAN_VAULT env: !`node -e "console.log(process.env.OBSIDIAN_VAULT||process.env.TOOLDI_VAULT||'not set')"`

## Your Task

You are the oh-my-obsidian setup wizard. Through a **multi-round interview**, collect essential project information and construct a tailored Obsidian vault structure.

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

## Phase 1: Project Interview

**CRITICAL UX RULES**:
- NEVER ask "press enter to skip/confirm" — empty messages cannot be sent in Claude Code.
- For optional follow-ups, use AskUserQuestion with a "건너뛰기" option. User can always use "Other" for custom typing.
- After collecting all info, proceed to Phase 2 immediately — no final confirmation.
- AskUserQuestion always provides an "Other" option automatically for free-text input.

---

### Q1. Project Name + Vault Path
Ask in plain text: "프로젝트/서비스 이름이 무엇인가요?"
→ Vault path auto-derived: `~/Documents/Obsidian/{project-name}`
→ If user provided argument, use that as vault path instead.
→ Tell user the derived path and move on immediately.

### Q2. Project Type
Use AskUserQuestion with 1 question:
- header: "프로젝트 타입", multiSelect: false
- options: 웹 서비스/SaaS, 모바일 앱, 게임 (웹/모바일/PC), 기타

Then use AskUserQuestion for follow-up (1 question):
- header: "상세 설명", multiSelect: false
- options:
  - "건너뛰기" — skip, record only the project type
  - "Other로 타겟 유저/핵심 기능 입력" — user types via Other
  - "B2C 소비자 서비스"
  - "B2B 기업용 / 내부 도구"
If user selects "건너뛰기", move on immediately.

### Q3. Tech Stack
Use AskUserQuestion with 3 questions:

Question 1 — header: "프론트엔드", multiSelect: false:
- React
- Next.js
- Vue
- React Native / Flutter

Question 2 — header: "백엔드", multiSelect: false:
- Node.js / Express / NestJS
- Spring Boot
- Django / FastAPI
- Go / Rust

Question 3 — header: "데이터베이스", multiSelect: false:
- MySQL / PostgreSQL
- MongoDB
- Firebase / Supabase
- Redis / DynamoDB

Then use AskUserQuestion for infra follow-up (1 question):
- header: "인프라", multiSelect: false
- options:
  - "AWS (EC2, S3, Lambda 등)"
  - "GCP"
  - "Azure / 기타"
  - "건너뛰기"
If user selects "건너뛰기", record only the tech stack selections.

### Q4. Team Structure
Ask in plain text: "팀 구성은 어떻게 되나요? (역할별 인원, 프론트/백엔드/디자인 등)"
→ Record and move on.

### Q5. 서비스 레이어 카테고리 선택
Use AskUserQuestion with 4 questions, all multiSelect:

Question 1 — header: "기본/코어", multiSelect: true:
- API 명세
- 아키텍처
- 코어/도메인
- 데이터베이스/스키마

Question 2 — header: "백엔드/연동", multiSelect: true:
- 인증/인가
- 비즈니스 로직
- 외부 API 연동
- 실시간 통신 (WebSocket/SSE)

Question 3 — header: "인프라/운영", multiSelect: true:
- 배포/인프라
- CI/CD
- 모니터링/로깅
- 보안

Question 4 — header: "특수기능", multiSelect: true:
- 결제
- 알림 (푸시/이메일/SMS)
- 사용자/권한 관리
- 파일/이미지 처리

Then use AskUserQuestion for custom additions (1 question):
- header: "추가 카테고리", multiSelect: false
- options:
  - "선택 완료 (추가 없음)"
  - "Other로 직접 입력" — user types custom category names
If user selects "선택 완료", proceed with selected categories only.

Record: selected + custom categories become **서비스 레이어** folders.

### Q6. Git Repository
Use AskUserQuestion with 1 question:
- header: "Git 레포", multiSelect: false
- options:
  - "새로 만들기 (로컬 init)"
  - "기존 레포 사용 (Other로 URL 입력)"

---

## Phase 2: Vault Construction

Based on collected info, construct the vault with these **mandatory layers**:

### Layer 1: 서비스 레이어 (Service Layer)
Generated from Q5 selections. One folder per selected category.

Example (user selected: API 명세, 인증/인가, 데이터베이스/스키마, 결제, 배포/인프라, 실시간 통신):
```
{서비스명}/
├── API_명세/
├── 인증_인가/
├── 데이터베이스_스키마/
├── 결제/
├── 배포_인프라/
└── 실시간_통신/
```

### Layer 2: 작업기록 레이어 (Work Records Layer) — ALWAYS present
```
작업기록/
├── 세션기록/
├── 의사결정/
├── 트러블슈팅/
└── 회의록/
```

### Layer 3: scripts/ — ALWAYS present
```
scripts/
├── team-setup/
│   ├── install.ps1
│   ├── install.sh
│   └── README.md
└── README.md
```

---

## Phase 3: Generate Files

### 3.1 Create directories
```bash
# 서비스 레이어
mkdir -p "$VAULT/{서비스명}/{각 카테고리}"

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
{Q2 answer — 서비스 설명}

## 기술 스택
{Q3 answer}

## 팀 구성
{Q4 answer}

## 볼트 구조
{generated tree}

## 핵심 지식 영역
{Q5 answer — 각 카테고리 설명}

---
*oh-my-obsidian으로 관리됨*
```

### 3.3 Generate team-setup scripts
Write `scripts/team-setup/install.ps1` and `install.sh`:
- Set OBSIDIAN_VAULT env var
- Create vault category folders (idempotent)
- Print verification steps

Write `scripts/team-setup/README.md`:
- Clone → install → restart → test instructions
- In Korean

### 3.4 Generate .obsidian stub (for Obsidian app)
```bash
mkdir -p "$VAULT/.obsidian"
```
Obsidian will auto-populate config on first open.

### 3.5 Set environment variable
- Windows: `[Environment]::SetEnvironmentVariable("OBSIDIAN_VAULT", $path, "User")`
- Unix: append `export OBSIDIAN_VAULT="$path"` to shell profile

### 3.6 Git init/commit
If new repo:
```bash
cd "$VAULT"
git init
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

For `team-sync`, if the helper returns `status: "blocked"`, explain the issues and fall back to `manual` or `safe` only after user confirmation.

### 4.3 Validate

After applying, run:

```bash
obsidian-git-setup validate "$VAULT"
```

Include the validation status and remaining manual actions in the final success message.

---

## Phase 5: Success Message

```
✅ oh-my-obsidian 설정 완료!

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
