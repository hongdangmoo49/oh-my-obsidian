---
description: "Interactive setup wizard for Obsidian vault integration"
argument-hint: "[vault-path]"
allowed-tools: Bash, Read, Write, Edit, Glob, AskUserQuestion
---

## Context
- Current directory: !`pwd`
- Git status: !`git status --short 2>/dev/null || echo "Not a git repo"`
- TOOLDI_VAULT env: !`echo "${TOOLDI_VAULT:-not set}"`

## Your Task

You are the oh-my-obsidian setup wizard. Guide the user through setting up an Obsidian vault connected to Claude Code for team memory persistence.

### Step 1: Vault Path
If the user provided a vault path as argument, use it. Otherwise ask:
- "볼트를 생성할 경로를 입력해주세요 (추천: ~/Documents/Obsidian/<project-name>)"
- Default suggestion: `~/Documents/Obsidian/llm-store`

### Step 2: Product Description
Ask the user:
- "프로덕트/프로젝트에 대해 설명해주세요 (팀이 기억해야 할 핵심 정보)"
- Record this for vault README and search context.

### Step 3: Vault Structure
Ask the user:
- "볼트 폴더 구조를 어떻게 할까요?"
- Offer options:
  1. **기본 템플릿** — 작업기록, 의사결정, 트러블슈팅, 회의록, 외부자료, 가이드
  2. **직접 지정** — 사용자가 원하는 구조 입력
  3. **프로덕트 설명 기반 자동 생성**

### Step 4: Git Repository
Ask the user:
- "볼트 git 레포지토리 URL을 입력해주세요 (새로 만들려면 'new')"
- If 'new': initialize git repo locally
- If URL: clone the repo

### Step 5: Create Vault
Create the vault directory structure:
```
{vault}/
├── 작업기록/
├── 의사결정/
├── 트러블슈팅/
├── 회의록/
├── 외부자료/
├── 가이드/
└── README.md          # 프로덕트 설명 포함
```

### Step 6: Generate Team Setup Scripts
Create inside the vault at `scripts/team-setup/`:
- `install.ps1` — Windows PowerShell install script
- `install.sh` — Mac/Linux Bash install script
- `README.md` — Team member onboarding guide

These scripts should:
1. Set TOOLDI_VAULT environment variable
2. Configure MCP server (llm-store-recall via SSE to https://mcp.tooldi.com/sse)
3. Configure Claude Desktop (if exists)
4. Validate MCP connectivity
5. Backup existing configs with timestamp

### Step 7: Configure Environment
- Set TOOLDI_VAULT in the user's shell profile (.bashrc, .zshrc, or PowerShell profile)
- For Windows: use `[Environment]::SetEnvironmentVariable("TOOLDI_VAULT", $path, "User")`
- For Unix: append `export TOOLDI_VAULT="$path"` to ~/.bashrc or ~/.zshrc

### Step 8: Success Message
Print:
```
✅ oh-my-obsidian 설정 완료!

볼트 경로: {vault}
Git 레포: {repo-url}

팀원 온보딩:
1. git clone {repo-url}
2. cd scripts/team-setup
3. install.ps1 (Windows) 또는 install.sh (Mac/Linux)
4. Claude Code 재시작
5. claude mcp list → "llm-store-recall ✓ Connected" 확인

시작하기: "editor schema 회상해줘" 로 테스트
```
