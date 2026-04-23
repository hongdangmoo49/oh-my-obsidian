# 🎬 Oh-My-Obsidian: Core User Scenarios

This document captures the vivid workflow from the moment a user first installs the `oh-my-obsidian` plugin to the moment they preserve their knowledge after an intense coding session.

---

## 🏃 Scenario 1: Plugin Installation & Second Brain Initialization (Setup)
*The critical first steps of starting a new project or attaching an AI memory drive to an existing legacy project.*

### 1. Download and Install
The user opens the terminal in an empty project folder (or an existing repository) and launches Claude Code.
```bash
$ claude
# Register the marketplace and install
> /plugin marketplace add https://github.com/hongdangmoo49/oh-my-obsidian
> /plugin install oh-my-obsidian@omob
```

Codex companion flow:
```bash
$ codex plugin marketplace add hongdangmoo49/oh-my-obsidian
```
Then the user opens Codex, enters `/plugins`, installs `oh-my-obsidian`, and asks:
```text
Set up an Obsidian vault for this project.
```

### 2. Trigger Socratic Setup
Once installed, the user runs the initialization wizard to connect their workspace to the Obsidian knowledge base.
```bash
> /oh-my-obsidian:setup
```
In Codex, do not type the Claude slash command above. Ask naturally instead:
```text
Set up an Obsidian vault for this project.
```

### 3. Preflight: Environment Check & Obsidian Auto-Installation
As soon as the initialization wizard starts, it checks your local system environment.
* **Claude:** "I've detected that the Obsidian desktop app is not installed on your machine. Shall I install it automatically via Homebrew (or Winget for Windows)?"
* **User:** "Yes"
* **Claude:** (Executes OS-specific background scripts to install the Obsidian app and configures the foundational vault directory)

### 4. Interview with the AI Agent (Vault-Architect in Action)
Instead of simply creating empty folders, the AI asks questions to deeply understand the context of the project.
* **Claude:** "Welcome! What domain of knowledge will primarily be stored in this folder? (e.g., Frontend React, Fintech Backend, etc.)"
* **User:** "It's a server-side codebase handling blockchain-based payments."
* **Claude:** "I see. Then Architectural Decision Records (ADR) concerning security and API pipeline specifications will be crucial. Should I construct a tailored folder structure like `[docs/adr]`, `[docs/architecture]`, and `[docs/api-specs]`? Do you want to sync this with your team?"
* **User:** "Yes, sounds perfect. Please set up the team sync as well."

### 5. Automatic Local Infrastructure Build
Upon user approval, the plugin generates the Obsidian folder ecosystem locally, creates `install.sh` / `install.ps1` scripts for future team onboarding, and commits all this initial setup to the Git repository. The once "amnesic" agent now possesses a "context-aware" second brain.

---

## 💾 Scenario 2: Post-Vibe Coding Session (End of Session)
*The moment after a user finishes an exhausting 3-hour "vibe coding" session, having introduced complex new libraries and architectures.*

### 1. End of Session and Fatigue
The user has just finished a massive overhaul, migrating the existing authentication system to a JWT-based one. The heavy coding is done, but the thought of having to re-explain all these complex architectural decisions and remaining bugs to the AI tomorrow is daunting.

### 2. Triggering the Magic Session-Save Command
Instead of simply closing the terminal, the user types the following command:
```bash
> /oh-my-obsidian:session-save
```
*(Note: You can also configure this to trigger automatically upon session termination using the `stop-hook`.)*

In Codex, the same flow is typically triggered with a direct prompt such as:
```text
Save this session to the Obsidian vault.
```

### 3. Context Compression & Document Archiving by AI
The plugin seamlessly reads through **the context of the conversation and all code modifications** made throughout the day.
* **Claude:** "I scanned today's session. You migrated the authentication structure to JWT and made a critical architectural decision to hash tokens using the `crypto` library. Shall I write a progress document about this and save it to your Obsidian vault?"
* **User:** "Yes."
* **Claude:**
  1. Auto-generates the file `2024-04-23_Session_Summary_JWT_Auth.md` in the vault.
  2. Neatly summarizes the session into "Background (Why)", "Core Code Logic (What)", and "Pending Tasks for Tomorrow (Todo)".
  3. Commits the new note when git state and approvals are safe, or clearly reports when commit/push is skipped.

### 4. Coding the Next Day (Recall)
The next day, the user opens the terminal and requests:
* **User:** "Continue from where we left off yesterday."
* **Claude:** *(Auto-scans the Vault)* "Yes, based on the vault document you saved yesterday, the JWT token issuance logic is complete. Today, I'll resume writing the code starting with the pending task: 'Refresh Token renewal logic'!"

In Codex, the same recall flow can start with:
```text
What did we decide yesterday about JWT token issuance?
```

**No more copying and pasting background knowledge or digging through repository history. Infinite context control starts here.**
