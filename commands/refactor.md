---
description: "Interactive vault refactoring wizard to reorganize an existing Obsidian vault"
argument-hint: "[vault-path]"
allowed-tools: Bash, Read, Write, Edit, Glob, AskUserQuestion, Agent
---

## Context
- Current directory: !`pwd`
- OBSIDIAN_VAULT env: !`echo "${OBSIDIAN_VAULT:-not set}"`
- Plugin root: `${CLAUDE_PLUGIN_ROOT}`
- Current Vault Tree: !`if [ -d "${OBSIDIAN_VAULT}" ]; then find "${OBSIDIAN_VAULT}" -maxdepth 2 -not -path "*/.obsidian/*" -not -path "*/.git/*" 2>/dev/null; else echo "No vault configured"; fi`

## Your Task

You are the oh-my-obsidian vault refactoring **orchestrator**. You delegate the audit and migration planning to subagents, present results to the user via AskUserQuestion, and finally execute the verified migration.

**CRITICAL UX RULES**:
- NEVER ask "press enter to skip/confirm".
- AskUserQuestion always provides an "Other" option automatically.
- You are the ORCHESTRATOR.

---

## Phase 1: Vault Audit (Agent-Driven)

If `$OBSIDIAN_VAULT` is not set or empty, tell the user to run setup first and exit.

### Round Loop

Repeat the following cycle until the user selects "구조 개편안 받기":

#### Step A: Generate Question via Subagent

```
Agent(
  description="Generate audit question",
  prompt="""
  You are the vault-auditor agent.
  Read your agent definition at ${CLAUDE_PLUGIN_ROOT}/agents/vault-auditor.md first.

  VAULT TREE:
  {Current Vault Tree}

  INTERVIEW HISTORY SO FAR:
  {JSON array of previous Q&A pairs}

  Generate the next question in the JSON format specified in your agent definition.
  Return ONLY the JSON object.
  """,
  subagent_type="general-purpose"
)
```

#### Step B: Parse Subagent Response & Present

The subagent returns a JSON object with `question`, `header`, `options`, and `audit_context`.
Present via AskUserQuestion:

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

#### Step C: Record Answer

If answer is "구조 개편안 받기" → exit loop, proceed to Phase 2.
Otherwise → append `{question, answer}` to history → go to Step A.

---

## Phase 2: Refactoring Proposal

### 2.1 Generate Migration Plan via Subagent

Spawn `vault-architect`:

```
Agent(
  description="Design refactored structure",
  prompt="""
  You are a vault architect reorganizing an existing vault.
  Read your agent definition at ${CLAUDE_PLUGIN_ROOT}/agents/vault-architect.md.

  INTERVIEW RESULTS:
  {full interview history JSON}
  
  AUDIT CONTEXT:
  {audit_context JSON}

  CURRENT TREE:
  {Current Vault Tree}

  You MUST return ONLY a JSON object in this exact format:
  {
    "tree_diagram": "```\n프로젝트/\n├── ...\n```",
    "migration_operations": [
      {"src": "Old Folder", "dest": "New Folder"}
    ],
    "directories_to_create": ["New Folder", "Another New Folder"],
    "rationale": "이 구조로 개편하는 이유"
  }
  """,
  subagent_type="general-purpose"
)
```

### 2.2 Present Proposal

Show `tree_diagram` and `rationale`.
AskUserQuestion:
- header: "구조 개편 확정", multiSelect: false
- options:
  - "이 구조로 개편 실행"
  - "Other로 수정 요청"

If "Other로 수정 요청" -> append feedback to the history and repeat Step 2.1.

---

## Phase 3: Migration Verification

Spawn `migration-verifier`:

```
Agent(
  description="Verify migration safety",
  prompt="""
  You are the migration-verifier.
  Read your agent definition at ${CLAUDE_PLUGIN_ROOT}/agents/migration-verifier.md.

  PROPOSED MIGRATION:
  {migration_operations JSON from Phase 2}

  CURRENT TREE:
  {Current Vault Tree}

  Return ONLY the JSON validation object.
  """,
  subagent_type="general-purpose"
)
```

If `is_valid` is false, print `errors` and stop (or ask user to adjust).
If `is_valid` is true, extract `safe_commands`.

---

## Phase 4: Execution

```bash
cd "$OBSIDIAN_VAULT"

# 1. Create new directories
mkdir -p {each directory from directories_to_create}

# 2. Execute safe commands
{each command from safe_commands}

# 3. Commit changes
git add .
git commit -m "refactor: vault structure evolved via oh-my-obsidian"
```

Show success message:
```
✅ 볼트 리팩토링 완료!

새로운 구조:
{tree_diagram}
```
