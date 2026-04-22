---
description: "Interactive setup wizard for Obsidian vault integration"
argument-hint: "[vault-path]"
allowed-tools: Bash, Read, Write, Edit, Glob, AskUserQuestion
---

## Context
- Current directory: !`pwd`
- OBSIDIAN_VAULT env: !`echo "${OBSIDIAN_VAULT:-not set}"`

## Your Task

You are the oh-my-obsidian setup wizard. Through a **multi-round interview**, collect essential project information and construct a tailored Obsidian vault structure.

---

## Phase 1: Project Interview (required — ask all of these)

**IMPORTANT**: Do NOT use AskUserQuestion tool. Ask questions in plain text and wait for the user's response naturally. The user will type their answers directly.

### Q1. Project Name + Vault Path
Ask: "프로젝트/서비스 이름이 무엇인가요?"
→ Vault path auto-derived: `~/Documents/Obsidian/{project-name}`
→ If user provided argument, use that as vault path instead.
→ Tell user the derived path and move on immediately — do NOT ask for confirmation.

### Q2. Project Description
Ask: "이 프로젝트는 어떤 서비스인가요? (도메인, 타겟 유저, 핵심 기능을 간단히 설명해주세요)"
→ Record and move on immediately.

### Q3. Tech Stack
Ask: "사용 중인 기술 스택은 무엇인가요? (프론트엔드, 백엔드, DB, 인프라 등)"
→ Record and move on immediately.

### Q4. Team Structure
"팀 구성은 어떻게 되나요? (역할별 인원, 프론트/백엔드/디자인 등)"
- Record: team roles and size

### Q5. 서비스 레이어 카테고리 선택
Use the AskUserQuestion tool with multiSelect enabled. Present 4 questions, each with 4 categories.

**Call AskUserQuestion with these 4 questions:**

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

After user selects, ask in plain text:
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
