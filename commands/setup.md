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

### Q5. Key Knowledge Areas
"팀이 계속 기억하고 있어야 할 핵심 지식 영역은 무엇인가요?"
- Examples: API 명세, 인증 방식, 배포 프로세스, 비즈니스 로직, 외부 연동
- Record: these become **서비스 레이어** categories

### Q6. Git Repository
"볼트 git 레포지토리 URL을 입력해주세요 (새로 만들려면 'new')"
- If 'new': initialize locally
- If URL: clone the repo

---

## Phase 2: Vault Construction

Based on collected info, construct the vault with these **mandatory layers**:

### Layer 1: 서비스 레이어 (Service Layer)
Generated from Q5 answers. Create one folder per knowledge area.

Examples based on project type:

**Web Service:**
```
{서비스명}/
├── API/
├── 인증/
├── 배포/
├── 비즈니스로직/
├── 외부연동/
└── 스키마/
```

**Mobile App:**
```
{서비스명}/
├── 화면정의/
├── API/
├── 상태관리/
├── 네이티브모듈/
└── 빌드배포/
```

**Data Pipeline:**
```
{서비스명}/
├── 데이터소스/
├── 파이프라인/
├── 변환로직/
├── 모니터링/
└── 스키마/
```

The exact structure is determined by the interview — there is no fixed template.

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
