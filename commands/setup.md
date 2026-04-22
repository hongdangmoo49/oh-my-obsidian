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

**IMPORTANT UX RULES**:
- Do NOT ask "press enter to skip/confirm" — empty messages cannot be sent in Claude Code.
- If a question is optional, just skip it entirely or provide a sensible default.
- After collecting all info, proceed to Phase 2 immediately without asking for confirmation.
- Only use AskUserQuestion for Q2, Q3, Q5 (structured selection). Q1, Q4, Q6 are plain text.

### Q1. Project Name + Vault Path
Ask: "프로젝트/서비스 이름이 무엇인가요?"
→ Vault path auto-derived: `~/Documents/Obsidian/{project-name}`
→ If user provided argument, use that as vault path instead.
→ Tell user the derived path and move on immediately — do NOT ask for confirmation.

### Q2. Project Type
Use AskUserQuestion with 1 question:
- header: "프로젝트 타입"
- multiSelect: false
- options:
  - 웹 서비스/SaaS
  - 모바일 앱
  - 게임 (웹/모바일/PC)
  - 기타 (Other로 입력)

After selection, if not "기타", ask in plain text:
"간단히 타겟 유저나 핵심 기능을 알려주세요. (건너뛰려면 'skip' 입력)"
If user says 'skip', just record the project type without extra detail.

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

After selection, ask in plain text:
"인프라나 외부 서비스가 있으면 알려주세요. (예: AWS, GCP, S3, Firebase 등, 건너뛰려면 'skip' 입력)"

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
"추가하고 싶은 카테고리가 있나요? (없으면 'no' 입력)"
→ If user provides names, append them.
→ If user says 'no' or '없어', proceed with selected categories only.

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
