# oh-my-obsidian — Plugin Specification

## 1. Overview

**oh-my-obsidian** is a plugin workflow for Claude Code and Codex that connects
an Obsidian vault to the agent environment, enabling teams to persist and
recall past work, decisions, and troubleshooting context across sessions.

This repository also ships a Codex plugin surface from `plugins/oh-my-obsidian/`
using the marketplace file `.agents/plugins/marketplace.json`.
In Codex, the guided setup, recall, session-save, and vault-manager flows are
typically reached through natural-language prompts or explicit skill names.

### Core Value Proposition
- "How did we solve that billing issue before?" → Auto-recall past documents
- "Record this" → Auto-save to vault 작업기록/
- Meeting notes, external resources → Auto-classify and store

### Architecture
```
Obsidian vault (git repo) + local file search + Claude Code / Codex plugin
(MCP server integration is optional — users can connect their own)
```

---

## 2. User Workflow

```
1. Install oh-my-obsidian plugin
2. Install Obsidian (if not installed)
3. Create git repo for vault
4. Start guided setup
   - Claude Code: run /oh-my-obsidian:setup
   - Codex: ask "Set up an Obsidian vault for this project."
   → Interactive prompt:
      - Product/project description
      - Desired vault structure
      - Git repo URL
5. Plugin configures:
     - Vault structure
     - Skills (recall, session-save, obsidian-vault-manager)
     - Stop hook
     - OBSIDIAN_VAULT env var
5.5 (Optional) Restore past session history:
    - Claude Code: `/oh-my-obsidian:setup` may include optional history restore (Phase 3.5)
    - Claude Code: `/oh-my-obsidian:restore-history` handles detailed transcript restoration
    - Codex: `$oh-my-obsidian-restore-history` skill or setup step 8 handles Codex rollout restoration
    - Both tools are supported: Claude history.jsonl + Codex rollout JSONL
6. Team members clone repo → run install scripts → collaborate
```

Codex implementation note:

- Marketplace entry: `.agents/plugins/marketplace.json`
- Codex plugin root: `plugins/oh-my-obsidian/`
- Verified Codex setup flow starts with:
  ```bash
  codex plugin marketplace add hongdangmoo49/oh-my-obsidian
  ```
- Then users open `/plugins`, install `oh-my-obsidian`, and ask:
  `Set up an Obsidian vault for this project.`

---

## 3. Plugin Directory Structure

```
oh-my-obsidian/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest
├── commands/
│   ├── setup.md                 # Interactive setup wizard
│   ├── refactor.md              # Vault refactoring orchestrator
│   ├── recall.md                # Recall past documents
│   ├── restore-history.md       # Session history restoration
│   ├── session-save.md          # Save session to vault
│   ├── enable-auto-save.md      # Register SessionEnd auto-save hook
│   └── vault.md                 # Vault management
├── agents/
│   ├── vault-architect.md       # Agent for vault structure design
│   ├── vault-auditor.md         # Agent to audit pain points
│   ├── migration-verifier.md    # Agent to validate safe movements
│   ├── socratic-interviewer.md  # Agent for Socratic interview
│   └── transcript-summarizer.md # Agent for transcript analysis
├── skills/
│   ├── recall/
│   │   └── SKILL.md             # Auto-recall skill
│   ├── session-save/
│   │   └── SKILL.md             # Session save skill
│   └── obsidian-vault-manager/
│       └── SKILL.md             # Vault management skill
├── hooks/
│   ├── hooks.json               # Hook configuration
│   └── stop-hook.sh             # Stop hook script
├── scripts/
│   ├── install.ps1              # Windows installer
│   └── install.sh               # Mac/Linux installer
├── .mcp.json                    # MCP server config (optional, user-defined)
├── guide.md                     # User-facing guide
├── SPEC.md                      # This file
└── README.md                    # Plugin README
```

Codex plugin structure in this repository:

```text
plugins/oh-my-obsidian/
├── .codex-plugin/plugin.json
├── README.md
├── skills/
│   ├── oh-my-obsidian-setup/
│   ├── oh-my-obsidian-recall/
│   ├── oh-my-obsidian-session-save/
│   ├── oh-my-obsidian-vault-manager/
│   └── oh-my-obsidian-restore-history/
├── scripts/
│   ├── codex-history.mjs
│   └── ...
├── hooks-preview/
├── config-snippets/
└── tests/
```

---

## 4. Component Specifications

### 4.1 Plugin Manifest (`plugin.json`)

```json
{
  "name": "oh-my-obsidian",
  "version": "0.1.0",
  "description": "Connect Obsidian vault to Claude Code for persistent team memory",
  "license": "MIT",
  "keywords": ["obsidian", "vault", "memory", "recall", "team"]
}
```

### 4.2 Commands

The command surface below is the Claude Code command surface. In Codex, users
typically ask naturally or explicitly invoke an installed skill such as
`$oh-my-obsidian-setup` or `$oh-my-obsidian-recall <intent>`.

#### `/oh-my-obsidian:setup`
Multi-round interactive setup wizard:
1. **Interview Phase** — collect 6 essential info:
   - Q1: Vault path
   - Q2: Project identity (name, domain, target users, core features)
   - Q3: Tech stack (frontend, backend, DB, infra)
   - Q4: Team structure (roles, size)
   - Q5: Key knowledge areas → become 서비스 레이어 categories
   - Q6: Git repo URL (or 'new')
2. **Construction Phase** — build vault with 3 mandatory layers
3. **Generation Phase** — create README, team-setup scripts, env var, git init
4. **Phase 3.5: History Restore** (optional) — lightweight restore from history.jsonl, non-blocking
5. **Success message** with generated vault tree

#### `/oh-my-obsidian:recall`
Search and recall past documents from vault via local file search.
If user has configured an MCP server with search capability, use it.

#### `/oh-my-obsidian:refactor`
Multi-phase automated vault refactoring orchestrated across 3 subagents:
1. **Vault Audit** (`vault-auditor`): Interviews the user about pain points based on the current folder tree.
2. **Proposal** (`vault-architect`): Generates a target tree, new directories, and specific `mv` operations.
3. **Verification** (`migration-verifier`): Validates logic to prevent nested folder conflicts or data loss.
4. **Execution**: Safely executes directory creation and file movements, then commits to Git.

#### `/oh-my-obsidian:session-save`
Save current session context to vault.

#### `/oh-my-obsidian:restore-history`
Full session restoration from Claude Code and/or Codex transcripts into the Obsidian vault.
- **argument-hint**: `[recent N | from YYYY-MM-DD to YYYY-MM-DD | all]`
- **allowed-tools**: Bash, Read, Write, Glob, AskUserQuestion, Agent
- **Supported sources**:
  - Claude Code: `~/.claude/projects/{hash}/*.jsonl` + `~/.claude/history.jsonl`
  - Codex: `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl` (default: `~/.codex/sessions/`)
- **Platform paths for Codex**:
  - macOS / Linux / WSL: `~/.codex/sessions/`
  - Windows native: `%USERPROFILE%\.codex\sessions\`
  - Override: `$CODEX_HOME/sessions/`
- **Phases**:
  1. **Preflight** — verify vault, check progress file, detect AI tools, select scope
  2. **Discovery** — scan Claude Code projects + Codex sessions, cross-ref history
  3. **Batch Processing** — 2 sessions / 300KB per batch via transcript-summarizer agent
  4. **Finalization** — git commit, cleanup progress file, summary
- Progress tracking via `.restore-progress.json` enables safe resume after interruption.

#### `/oh-my-obsidian:vault`
Manage vault: list, add, organize.

### 4.3 Skills

#### `recall`
- **Trigger**: "회상", "기억나", "이전에", "어떻게 했지", "recall", "remember"
- **Behavior**: The agent automatically searches vault for relevant past context
- **Tools**: Bash, Read, Glob, Grep (local search); MCP if user-configured

#### `session-save`
- **Trigger**: "기록해", "저장해", "save", "기록"
- **Behavior**: Saves current session summary to vault 작업기록/ with structured frontmatter (type, services, related_docs, status) and auto-generated wikilinks to related documents
- **Tools**: Write, Bash (for git operations), Read, Glob (for related-doc discovery)

#### `obsidian-vault-manager`
- **Trigger**: "vault", "볼트", "문서 정리", "분류", "organize"
- **Behavior**: Manages vault structure, adds/organizes documents
- **Tools**: Read, Write, Bash, Glob

### 4.4 Hooks

#### Stop Hook
- **Event**: `Stop`
- **Behavior**: Prompts user to save session before ending
- **Skip**: User can type "session-save skip" to suppress
- **Script**: `hooks/stop-hook.sh` — outputs prompt text asking to save

### 4.5 MCP Configuration (`.mcp.json`)

Empty by default — users configure their own MCP servers during setup or
manually.

### 4.6 Agents

#### `vault-architect`
- **Tools**: Read, Glob, Grep, Bash, Write, Edit
- **Model**: sonnet
- **Role**: Designs Obsidian vault folder structures based on project interview results

#### `vault-auditor`
- **Model**: sonnet
- **Role**: Audits current vault structure to identify pain points

#### `migration-verifier`
- **Model**: sonnet
- **Role**: Validates vault migration plans to prevent data loss or conflicts

#### `socratic-interviewer`
- **Tools**: Read, Glob, Grep
- **Model**: sonnet
- **Role**: Conducts Socratic interviews to gather vault setup requirements through focused questions

#### `transcript-summarizer`
- **Tools**: Read, Glob, Grep
- **Model**: sonnet
- **Role**: Reads raw JSONL transcript data and produces structured session summaries
- **Output**: JSON with per-session topic, category, summary, decisions, errors, files, tools
- **Categories**: 세션기록 (default), 의사결정 (architecture/design), 트러블슈팅 (debugging)

### 4.7 Environment Variables
- `OBSIDIAN_VAULT`: Absolute path to the Obsidian vault directory

---

## 5. Vault Structure (Generated by Setup)

Vault has **3 mandatory layers**, dynamically constructed from the project interview:

### Layer 1: 서비스 레이어 (Service Layer) — project-specific
Generated from interview Q5 (key knowledge areas). One folder per area.

```
{서비스명}/
├── {knowledge-area-1}/    # e.g., API/, 인증/, 배포/
├── {knowledge-area-2}/    # e.g., 비즈니스로직/, 스키마/
└── {knowledge-area-N}/    # determined by project needs
```

### Layer 2: 작업기록 레이어 (Work Records) — always present
```
작업기록/
├── 세션기록/     # Session work logs
├── 의사결정/     # Decision records (ADR)
├── 트러블슈팅/   # Problem/solution records
└── 회의록/       # Meeting notes
```

### Layer 3: scripts/ — always present
```
scripts/
├── team-setup/
│   ├── install.ps1
│   ├── install.sh
│   └── README.md
└── README.md
```

### Full Example (Web Service)
```
vault/
├── my-service/              # 서비스 레이어
│   ├── API/
│   ├── 인증/
│   ├── 배포/
│   ├── 비즈니스로직/
│   └── 스키마/
├── 작업기록/                # 작업기록 레이어
│   ├── 세션기록/
│   ├── 의사결정/
│   ├── 트러블슈팅/
│   └── 회의록/
├── _templates/              # Document templates
│   └── 작업기록/
│       ├── 세션기록.md
│       ├── 의사결정.md
│       ├── 트러블슈팅.md
│       └── 회의록.md
├── _bases/                  # Obsidian Bases views
│   ├── session-logs.base
│   ├── decisions.base
│   ├── troubleshooting.base
│   └── meeting-notes.base
├── scripts/                 # scripts 레이어
│   └── team-setup/
│       ├── install.ps1
│       ├── install.sh
│       └── README.md
├── .obsidian/               # Obsidian config
└── README.md                # Project overview
```

### Layer 4: _templates/ and _bases/ — structural enforcement
```
_templates/
├── 작업기록/
│   ├── 세션기록.md      # type: session-log template
│   ├── 의사결정.md      # type: decision template
│   ├── 트러블슈팅.md    # type: troubleshooting template
│   └── 회의록.md        # type: meeting-notes template
_bases/
├── session-logs.base     # auto-aggregation for session-log
├── decisions.base        # auto-aggregation for decision
├── troubleshooting.base  # auto-aggregation for troubleshooting
└── meeting-notes.base    # auto-aggregation for meeting-notes
```

Templates enforce frontmatter structure. Bases views auto-aggregate by `type` field.

### Document Frontmatter Schema

Every generated document includes these frontmatter fields:

```yaml
---
type: session-log | decision | troubleshooting | meeting-notes | knowledge
date: ISO-8601 timestamp
topic: string
category: 세션기록 | 의사결정 | 트러블슈팅 | 회의록
participants: [string]
services: [string]
tags: [string]
related_docs: [string]    # vault-relative paths to linked documents
status: done | decided | resolved | in-progress
---
```

The `type` field is the primary classifier for Obsidian Bases auto-aggregation.
The `related_docs` array stores vault-relative paths to related documents.
The body section `## 관련 문서` renders these as `[[wikilink]]` for Obsidian graph view.

---

## 6. Install Scripts

### Requirements
- git

### Script Behavior
1. Check prerequisites
2. Set OBSIDIAN_VAULT env var (persistent)
3. Create vault category folders
4. Print verification instructions

---

## 7. Team Collaboration Flow

1. **Initial setup** (one person):
   - Install plugin → start guided setup
   - Claude Code: `/oh-my-obsidian:setup`
   - Codex: `Set up an Obsidian vault for this project.`
   - Push vault to git repo
2. **Team member onboarding**:
   - Clone vault repo
   - Run `scripts/team-setup/install.ps1` (or `.sh`)
   - Restart Claude Code or Codex
3. **Daily usage**:
   - Recall past context: "이전에 정기결제 이슈 어떻게 해결했지?"
   - Save sessions: "이 작업 기록해줘"
   - Organize docs: "회의록 정리해줘"
4. **Restore history**:
   - Claude Code today: `/oh-my-obsidian:restore-history recent 10`
   - Claude Code full restore: `/oh-my-obsidian:restore-history all`
   - Codex: `$oh-my-obsidian-restore-history` skill with scope selection
   - Codex setup: step 8 in the setup flow offers automatic restoration

---

## 8. Platform Support

| Feature | Claude Code | Codex | Claude Desktop |
|---------|------------|-------|----------------|
| Skills | Yes | Yes | No (manual) |
| Commands | Yes | Natural language / skill invocation | No |
| Hooks | Yes | Preview only | No |
| MCP Server | Optional | Optional | Optional |
| Recommended | **Yes** | **Yes** | Limited |

---

## 9. Implementation Priority

1. Plugin manifest + directory structure
2. `commands/setup.md` (interactive setup)
3. Skills (recall, session-save, obsidian-vault-manager)
4. Hooks (stop hook)
5. Install scripts (PowerShell + Bash)
6. Agent (vault-architect)
7. Documentation
8. restore-history command + transcript-summarizer agent
