---
description: "Interactive setup wizard for Obsidian vault integration"
argument-hint: "[vault-path]"
allowed-tools: Bash, Read, Write, Edit, Glob, AskUserQuestion
---

## Context
- Current directory: !`node -e "console.log(process.cwd())"`
- Obsidian app preflight: !`node -e "const {spawnSync}=require('node:child_process');const path=require('node:path');const root=process.env.CLAUDE_PLUGIN_ROOT||process.cwd();const script=path.join(root,'scripts','obsidian-app-preflight.mjs');const r=spawnSync(process.execPath,[script,'check'],{stdio:'inherit'});process.exit(r.status??1)"`
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
     node "${CLAUDE_PLUGIN_ROOT:-.}/scripts/obsidian-app-preflight.mjs" install
     ```
   - If the user declines, allow "install later" and continue only after explicit confirmation.
3. If `platform` is `windows` and the setup is running under native PowerShell, use:
   ```powershell
   node .\scripts\obsidian-app-preflight.mjs install
   ```
4. If Obsidian is missing and `recommendation.canAutoInstall` is `false`:
   - Tell the user to install from `recommendation.manualUrl`.
   - Ask whether to continue setup and install Obsidian later.
5. If `context` is `container`:
   - Do not install Obsidian in the container.
   - Tell the user to install Obsidian on the desktop host and continue only after explicit skip/confirmation.

Do not create a vault until Obsidian app preflight is completed or explicitly skipped.

---

## Phase 1: Project Interview (required — ask all of these)

### Q1. Vault Path
"볼트를 생성할 경로를 입력해주세요"
- Default: `~/Documents/Obsidian/<project-name>`
- If argument provided, use it

### Q2. Project Identity
"프로젝트/서비스 이름이 무엇인가요?"

"이 프로젝트는 어떤 서비스인가요? (도메인, 타겟 유저, 핵심 기능을 간단히 설명해주세요)"
- Record: domain, target users, core features

### Q3. Tech Stack
"사용 중인 기술 스택은 무엇인가요? (프론트엔드, 백엔드, DB, 인프라 등)"
- Record: languages, frameworks, databases, deployment

### Q4. Team Structure
"팀 구성은 어떻게 되나요? (역할별 인원, 프론트/백엔드/디자인 등)"
- Record: team roles and size

### Q5. 서비스 레이어 카테고리 선택
Show the following normalized list and let the user pick multiple. Also allow custom additions.

"볼트의 서비스 레이어에 들어갈 카테고리를 선택해주세요. (복수 선택 가능, 이후 직접 추가도 가능합니다)"

**기본 (모든 프로젝트):**
1. □ API 명세
2. □ 아키텍처
3. □ 코어/도메인

**백엔드:**
4. □ 인증/인가
5. □ 데이터베이스/스키마
6. □ 비즈니스 로직
7. □ 외부 API 연동
8. □ 캐싱
9. □ 스케줄링/배치

**프론트엔드:**
10. □ 화면/페이지 정의
11. □ 상태 관리
12. □ 디자인 시스템

**인프라/운영:**
13. □ 배포/인프라
14. □ CI/CD
15. □ 모니터링/로깅
16. □ 보안

**특수 기능:**
17. □ 결제
18. □ 알림 (푸시/이메일/SMS)
19. □ 실시간 통신 (WebSocket/SSE)
20. □ 검색
21. □ 파일/이미지 처리
22. □ 사용자 관리
23. □ 권한 관리
24. □ 마이그레이션

After user selects, ask:
"추가하고 싶은 카테고리가 있나요? (없으면 엔터)"
→ Append any custom categories.

Record: selected + custom categories become **서비스 레이어** folders.

### Q6. Git Repository
"볼트 git 레포지토리 URL을 입력해주세요 (새로 만들려면 'new')"
- If 'new': initialize locally
- If URL: clone the repo

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

## Phase 4: Success Message

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
