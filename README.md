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

**Install** — Install the plugin directly in your Claude Code session:

```bash
/plugin install oh-my-obsidian
```

*(For local development: `claude --plugin-dir /path/to/oh-my-obsidian`)*

**Initialize** — Run the interactive Socratic setup wizard:

```
> /oh-my-obsidian:setup
```

<details>
<summary><strong>What happens during setup?</strong></summary>

The plugin will:
1. Check for the Obsidian desktop app on your system.
2. Conduct a Socratic interview to understand your project (domain, tech stack, team size).
3. Generate a tailored folder structure via the `vault-architect` agent.
4. Set up an Obsidian Git team-sync workflow for seamless collaboration.
</details>

---

## How It Works

Oh-my-obsidian acts as a bridge between the **AI (Claude Code)**, the **Knowledge Base (Obsidian)**, and the **Team (Git)**.

```text
    [ Claude Code ] <---> [ oh-my-obsidian ] <---> [ Obsidian Vault ]
           |                                             |
           +----------------( Git Sync )-----------------+
```

| Phase | Action |
| :--- | :--- |
| **Initialize** | Socratic agents interview you to design a tailored vault structure |
| **Work** | Claude retrieves context via `recall` to solve coding tasks |
| **Document** | Claude records decisions via `session-save` directly into the vault |
| **Evolve** | As the project grows, `refactor` audits and safely reorganizes folders |

---

## Commands

Use these commands directly inside your Claude Code session.

| Command | Role | Description |
| :--- | :--- | :--- |
| `/oh-my-obsidian:setup` | **Bootstrap** | Socratic interview to create and sync a new project vault |
| `/oh-my-obsidian:refactor` | **Evolve** | Audits an existing vault and safely executes a structural migration |
| `/oh-my-obsidian:recall <query>` | **Retrieve** | Semantically searches the vault for past context |
| `/oh-my-obsidian:session-save` | **Record** | Summarizes the current session and archives it to the vault |
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

<p align="center">
  <em>"A second brain for your AI."</em>
  <br/><br/>
  <strong>Oh-my-obsidian</strong>
  <br/><br/>
  <code>MIT License</code>
</p>
