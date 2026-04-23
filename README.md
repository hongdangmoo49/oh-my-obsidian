# oh-my-obsidian

[English](README.md) | [한국어](README.ko.md)

A Claude Code / Desktop plugin that serves as a persistent memory for your team's past work, decisions, and troubleshooting context.

## Features

- **Recall** — "How did we solve the recurring payment issue?" → Automatically recalls past documents.
- **Session Save** — "Record this work" → Automatically organizes and saves session context to the vault's `Work Records/`.
- **Vault Management** — Meeting notes, external resources → Automatically classifies and stores them in the appropriate location.

How it works: Obsidian vault (git repo) + local file search + Claude Code plugin
(MCP server integration is optional)

## Installation

```bash
# Install the plugin in Claude Code
/plugin install oh-my-obsidian

# Or for local development
claude --plugin-dir /path/to/oh-my-obsidian
```

## Initialization

```bash
# Run the interactive setup wizard
/oh-my-obsidian:setup
```

The setup wizard analyzes your project through an interview:
1. Project identity (Name, Domain, Core Features)
2. Tech Stack
3. Team Structure
4. Key Knowledge Areas → Automatically generates Service Layer
5. Git Repository connection
6. Automatically generates installation scripts for team members

## Commands

| Command | Description |
|--------|------|
| `/oh-my-obsidian:setup` | Interactive setup wizard |
| `/oh-my-obsidian:recall <query>` | Recall past documents |
| `/oh-my-obsidian:session-save [topic]` | Save session work records |
| `/oh-my-obsidian:vault <list\|add\|organize>` | Vault management |

## Team Member Onboarding

After the setup is complete, installation scripts are generated in the `scripts/team-setup/` directory of the vault repository:

```bash
# Team Members: After cloning the repo
cd scripts/team-setup
./install.sh     # Mac/Linux
.\install.ps1    # Windows
```

## 🔧 Prerequisites

Items that users must **manually** prepare to run the plugin normally:

- **Node.js 18 or higher** must be installed on your system.
- **Git** must be installed on your system.
- You need one **empty local folder (empty Git repository)** where the plugin will save and synchronize files (e.g., `mkdir my-vault && cd my-vault && git init`).

## ⚙️ Under the Hood

For user convenience, this plugin automatically performs the following tasks during the initial setup (`/oh-my-obsidian:setup`), and may use file download/execution permissions on your local PC. **All installation and configuration tasks will prompt you for consent before proceeding.**

1. **Obsidian Desktop App Synchronization/Guide**: If Obsidian is not installed on your PC, it assists in or automates the installation by running OS-specific installation scripts (brew, winget, etc.) based on your operating system (Windows/Mac).
2. **Obsidian Git Plugin Auto-configuration**: To ensure smooth memo synchronization among team members, it automatically creates the `.obsidian/plugins/obsidian-git` folder in your vault and downloads the latest release of the Git plugin to set it up.
3. **Local Script Generation & Environment Variable Registration**: Generates `.ps1` or `.sh` scripts required for local repository setup during team onboarding, and assists in setting the `OBSIDIAN_VAULT` environment variable.

## Plugin Structure

```
oh-my-obsidian/
├── .claude-plugin/plugin.json   # Plugin manifest
├── commands/                    # User commands
├── skills/                      # Auto-triggered skills
├── agents/                      # Sub-agents
├── hooks/                       # Session stop hooks
├── scripts/                     # Installation scripts
└── .mcp.json                    # MCP server config (optional)
```

## License

MIT
