# oh-my-obsidian Project Context

[English](project-context.md) | [한국어](project-context.ko.md)

> AI Agent Implementation Guide - Read this BEFORE writing any code.

## Core Philosophy

**oh-my-obsidian** is a plugin that connects Claude Code and an Obsidian Vault to create a "persistent team memory".
All features operate within the `Claude Code plugin ecosystem` and aim to run lightweight with minimal external dependencies (preferring local search tools like git, bash).

---

## Critical Rules

### 1. Tech Stack & Environment
| Rule | Description |
|------|---------|
| **Form** | Claude Code Plugin (Node.js 18+) |
| **Dependencies** | Prioritize utilizing local CLI tools (`grep`, `find`, `git`) over installing external Node packages. |
| **Search Logic** | Fundamentally prioritize local file system exploration, but utilize MCP if the user has an MCP connected. |

### 2. Directory and File Naming Structure
File paths for this plugin are strictly managed.

| Role | Path Format | Example |
|------|--------|---------|
| Plugin Manifest | `.claude-plugin/plugin.json` | - |
| User Commands | `commands/{name}.md` | `commands/setup.md` |
| Auto-active Skills | `skills/{name}/SKILL.md` | `skills/recall/SKILL.md` |
| Sub-agents | `agents/{name}.md` | `agents/vault-architect.md` |
| Hooks | `hooks/hooks.json`, `hooks/{name}.sh` | `hooks/stop-hook.sh` |
| Install Scripts | Inside `scripts/` | `scripts/install.sh` |

### 3. State Management & Environment Variables
- All vault controls are based on the absolute path pointed to by the `OBSIDIAN_VAULT` environment variable.
- When writing scripts, you must include exception handling for cases where this environment variable is missing.

---

## Anti-Patterns (Forbidden)

### 1. Excessive External Package Dependencies
```javascript
// DON'T: Install heavy npm packages just for simple file search
const glob = require('glob');

// DO: Write SKILL.md prompts that actively utilize built-in features or Bash tools (grep, rg) whenever possible
```

### 2. Forced Synchronization Ignoring the User
The vault is also the user's personal memory space.
Avoid actions that arbitrarily overhaul or delete the folder structure without going through the setup wizard (`/oh-my-obsidian:setup`).

### 3. Forcing Hooks
The shutdown hook (`stop-hook.sh`) should only advise the user to save the session. It must never apply a blocking constraint like "cannot exit without saving" (e.g., must include a `session-save skip` capability).

---

## Quick Reference
- Full spec model and folder hierarchy: [SPEC.md](./SPEC.md)
- User manual and guide: [README.md](./README.md)
