<p align="center">
  <br/>
  ◯ ─────────── ◯
  <br/><br/>
  <img src="https://upload.wikimedia.org/wikipedia/commons/1/10/2023_Obsidian_logo.svg" width="120" alt="Obsidian">
  <br/><br/>
  <strong>O H - M Y - O B S I D I A N</strong>
  <br/><br/>
  ◯ ─────────── ◯
  <br/>
</p>

<p align="center">
  <strong>Stop forgetting. Start remembering.</strong>
  <br/>
  <sub>Give your AI coding agents a permanent, evolving second brain.</sub>
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README.ko.md">한국어</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License"></a>
  <img src="https://img.shields.io/badge/Claude_Code-Plugin-purple" alt="Claude Code">
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#why-oh-my-obsidian">Why</a> ·
  <a href="#how-it-works">How It Works</a> ·
  <a href="#commands">Commands</a> ·
  <a href="#the-agents">The Agents</a>
</p>

**Oh-my-obsidian transforms Claude Code into an agent with infinite memory.**

AI coding agents are brilliant but amnesiac. Oh-my-obsidian bridges this gap by integrating an Obsidian vault directly into your Claude Code workflow. Through Socratic interviews, automated refactoring, and real-time Git sync, your AI learns your project's context, records its decisions, and recalls them perfectly across sessions.

---

## Why Oh-My-Obsidian?

Most AI coding agents start every session with a blank slate. 

| Problem | What Happens | Oh-My-Obsidian Fix |
| :--- | :--- | :--- |
| **Amnesia** | AI forgets why a decision was made last week | `session-save` records architectural decisions into Markdown |
| **Lost Context** | You paste the same context over and over | `recall` automatically searches the vault for relevant past work |
| **Messy Docs** | Documentation rots and becomes disorganized | `refactor` safely reorganizes the vault as the project evolves |
| **Setup Friction** | Hard to bootstrap a good folder structure | Socratic `setup` interviews you to generate a tailored vault |

---

## Quick Start

### Claude Code Quick Start

```bash
# 1. Add our custom marketplace
/plugin marketplace add https://github.com/hongdangmoo49/oh-my-obsidian

# 2. Install the plugin
/plugin install oh-my-obsidian@omob
```

**Install via Official Marketplace** — (Pending Approval) If installed from the official Claude registry:
```bash
/plugin install oh-my-obsidian
```

*(For local development: `claude --plugin-dir /path/to/oh-my-obsidian`)*

**Initialize** — Run the interactive Socratic setup wizard:

```
> /oh-my-obsidian:setup
```

### Codex Quick Start

Codex reads the repository marketplace from:

```text
.agents/plugins/marketplace.json
```

Add the marketplace from GitHub:

```bash
codex plugin marketplace add hongdangmoo49/oh-my-obsidian
```

Then open Codex and install `oh-my-obsidian` from the plugin directory:

```text
/plugins
```

Then ask Codex:

```text
Set up an Obsidian vault for this project.
```

After setup, you can continue with Codex using natural-language prompts or an
explicit skill name such as:

```text
What did we decide last time about the vault layout?
Save this session to the Obsidian vault.
Show me the vault health check.
Add a note to the vault for today's API decisions.
$oh-my-obsidian-recall Find our prior vault-layout decision.
```

<details>
<summary><strong>What happens during setup?</strong></summary>

The plugin will:
1. Check for the Obsidian desktop app on your system.
2. Conduct a Socratic interview to understand your project (domain, tech stack, team size).
3. Generate a tailored folder structure via the `vault-architect` agent.
4. Offer an optional Obsidian Git choice (`safe`, `manual`, or `team-sync`) after separate approvals.
</details>

## Codex Plugin

Codex support is shipped from a separate plugin root:

```text
plugins/oh-my-obsidian/
```

Use the Codex-native marketplace file:

```text
.agents/plugins/marketplace.json
```

When users add `hongdangmoo49/oh-my-obsidian` as a Codex marketplace source,
Codex reads this marketplace and exposes the bundled `oh-my-obsidian` plugin.
Do not reuse `.claude-plugin/marketplace.json` for Codex.

Typical Codex start flow:

1. run `codex plugin marketplace add hongdangmoo49/oh-my-obsidian`
2. run `codex`, then open `/plugins` and install `oh-my-obsidian`
3. ask Codex: `Set up an Obsidian vault for this project.`

The Codex plugin keeps the same product shape: guided setup, recall,
session-save, vault management, and an opt-in hooks preview. In Codex, these
flows are typically used through natural-language prompts or explicit skill
invocation rather than Claude-style slash commands.

## Feature Matrix

| Capability | Claude Code Plugin | Codex v1 | Codex Hooks Preview |
| :--- | :--- | :--- | :--- |
| Guided setup | Yes | Yes | N/A |
| Recall | Yes | Yes | N/A |
| Session save | Yes | Yes | Reminder only |
| Vault manager | Yes | Yes | N/A |
| Hook auto-enable | Yes | No | Opt-in only |
| Hook install path | Claude config | N/A | `~/.codex/hooks/...` or repo `.codex/hooks/...` |

---

## How It Works

Oh-my-obsidian acts as a bridge between the **AI (Claude Code)**, the **Knowledge Base (Obsidian)**, and the **Team (Git)**.

In Codex, the same loop is driven through skill-guided prompts rather than the
Claude command surface shown below.

```text
    [ Claude Code ] <---> [ oh-my-obsidian ] <---> [ Obsidian Vault ]
           |                                             |
           +----------------( Git Sync )-----------------+
```

| Phase | Action |
| :--- | :--- |
| **Initialize** | Socratic agents interview you to design a tailored vault structure |
| **Work** | The agent retrieves context via `recall` to solve coding tasks |
| **Document** | The agent records decisions via `session-save` directly into the vault |
| **Evolve** | As the project grows, `refactor` audits and safely reorganizes folders |

---

## Commands

Use these commands directly inside your Claude Code session.

In Codex, use the equivalent natural-language prompts or explicitly invoke the
installed skill surface, such as `$oh-my-obsidian-setup`,
`$oh-my-obsidian-recall`, `$oh-my-obsidian-session-save`, and
`$oh-my-obsidian-vault-manager`.

| Command | Role | Description |
| :--- | :--- | :--- |
| `/oh-my-obsidian:setup` | **Bootstrap** | Socratic interview to create and sync a new project vault |
| `/oh-my-obsidian:refactor` | **Evolve** | Audits an existing vault and safely executes a structural migration |
| `/oh-my-obsidian:recall <query>` | **Retrieve** | Semantically searches the vault for past context |
| `/oh-my-obsidian:session-save` | **Record** | Summarizes the current session and archives it to the vault |
| `/oh-my-obsidian:enable-auto-save` | **Config** | Enables auto-save hook on SessionEnd for existing users |
| `/oh-my-obsidian:vault` | **Manage** | General purpose vault management (list, add, organize) |

---

## The Agents

Oh-my-obsidian uses specialized sub-agents to handle complex reasoning tasks. They do the heavy lifting so you don't have to.

| Agent | Role | Core Question |
| :--- | :--- | :--- |
| **Socratic Interviewer** | Guides project setup | *"What is the core domain and tech stack of this project?"* |
| **Vault Architect** | Designs folder structures | *"What is the optimal vault layout for this specific team?"* |
| **Vault Auditor** | Diagnoses messy vaults | *"Where are the bottlenecks and overgrown folders in this vault?"* |
| **Migration Verifier** | Ensures safe refactoring | *"Will moving this folder cause data loss or nested overlaps?"* |

---

## Team Onboarding

Once a vault is initialized with Git sync, onboarding a new team member takes seconds.
The setup command automatically generates cross-platform installation scripts in the vault.

```bash
# Team member clones the repo, then runs:
cd scripts/team-setup
./install.sh     # Mac/Linux
.\install.ps1    # Windows
```

---

## 🔧 Prerequisites

Items that users must **manually** prepare to run the plugin normally:

- **Node.js 18 or higher** must be installed on your system.
- **Git** must be installed on your system.
- You need one **empty local folder (empty Git repository)** where the plugin will save and synchronize files (e.g., `mkdir my-vault && cd my-vault && git init`).

## ⚙️ Under the Hood

During setup, the plugin can help with the following tasks, but each sensitive
step is permission-gated and may be skipped. Package-manager installs, shell
profile edits, config-pointer creation, third-party downloads, community plugin
enablement, and auto-sync choices all require separate approval.

1. **Obsidian Desktop App Detection and Install Guidance**: The setup checks whether Obsidian is available in the current environment. Automatic install is only offered when the platform/context supports it and only after explicit approval. Container and WSL flows have stricter limits.
2. **Obsidian Git Plugin Choices**: After the vault exists, setup can offer `safe`, `manual`, or `team-sync` Obsidian Git options. Download, enablement, and sync behavior are separate approvals, not defaults.
3. **Local Script Generation and Environment Setup Guidance**: Setup generates onboarding scripts and can help users set `OBSIDIAN_VAULT`, but shell profile edits or Codex config-pointer creation are opt-in and approval-gated.

For Codex follow-up skills, vault resolution checks `OBSIDIAN_VAULT` first and
then the optional approved config pointer at `~/.oh-my-obsidian/config.json`.

## Permission Boundaries

Both Claude Code and Codex flows require explicit approval before:

- package-manager installs
- shell profile mutation
- third-party Obsidian Git downloads
- community plugin enablement
- auto-sync or team-sync behavior
- git remote changes or push operations
- overwrites, moves, deletes, or reconcile actions
- hook preview installation

Codex-only approval boundary:

- creation of Codex config pointers

## Plugin Structure

```
oh-my-obsidian/
├── .claude-plugin/plugin.json   # Claude plugin manifest
├── commands/                    # Claude command surface
├── skills/                      # Claude/root skills
├── agents/                      # Claude sub-agents
├── hooks/                       # Claude session hooks
├── scripts/                     # Shared/root installation scripts
├── .mcp.json                    # MCP server config (optional)
├── .agents/plugins/marketplace.json
└── plugins/oh-my-obsidian/      # Codex plugin surface
```

---

<p align="center">
  <em>"A second brain for your AI."</em>
  <br/><br/>
  <strong>Oh-my-obsidian</strong>
  <br/><br/>
  <code>MIT License</code>
</p>
