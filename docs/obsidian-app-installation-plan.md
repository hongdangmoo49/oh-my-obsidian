# Obsidian App Installation Plan

## Document Info

| Field | Value |
| --- | --- |
| Title | Obsidian App Installation Plan for Claude Plugin Setup |
| Type | TO-BE |
| Status | Draft |
| Owner | oh-my-obsidian |
| Date | 2026-04-22 |

## 1. Purpose

This document defines how the `oh-my-obsidian` Claude Code plugin should handle Obsidian app installation at the beginning of `/oh-my-obsidian:setup`.

The goal is not to make a generic Obsidian installer. The goal is to make the Claude plugin setup flow smooth:

1. Check whether Obsidian is available on the user's actual desktop OS.
2. If it is missing, offer the correct OS-specific install path.
3. Continue into the vault interview only after the user has a viable Obsidian app path.
4. After vault creation, install and configure the Obsidian Git community plugin inside the generated vault.

## 2. Background

The current setup flow starts with vault path and interview questions. The planned flow should prepend an Obsidian app preflight:

```text
/oh-my-obsidian:setup
-> Stage 0. Obsidian app preflight
-> Stage 1. Vault path and interview
-> Stage 2. Vault structure generation
-> Stage 3. Obsidian Git plugin installation/configuration
-> Stage 4. Claude Code MCP/skills/hooks/team setup output
```

This distinction matters because this project is a Claude Code plugin. It may run in native Windows, macOS, Linux, WSL, SSH, or a Docker container. Installing a desktop app from inside the plugin is only safe when the plugin has access to the user's desktop package manager.

## 3. Scope

### In Scope

- Detect the current execution context.
- Detect whether Obsidian appears to be installed.
- Select the recommended install command per desktop OS.
- Ask before running app install commands.
- Provide manual commands when automatic execution is not safe.
- Document Linux distribution-specific choices.
- Preserve the later handoff to vault interview and Obsidian Git plugin setup.

### Out of Scope

- Implementing a replacement for Obsidian Sync or Obsidian Git.
- Managing Obsidian accounts or licenses.
- Configuring every Linux desktop launcher variant.
- Installing Obsidian inside Docker containers as the normal path.
- Installing Obsidian mobile apps.

## 4. Actors and Preconditions

| Actor | Description |
| --- | --- |
| Setup user | Runs `/oh-my-obsidian:setup` from Claude Code. |
| Claude Code plugin | Orchestrates checks, asks for permission, and runs safe setup steps. |
| Desktop OS package manager | Installs Obsidian where available. |
| Obsidian app | Opens the generated vault after setup. |

Preconditions:

- Claude Code is running and the `oh-my-obsidian` plugin is loaded.
- The setup user can approve shell commands.
- Git must be installed before Obsidian Git sync can work.
- On WSL or Docker, the plugin must not assume it can install GUI apps on the Windows host.

## 5. Use Cases

### UC-01. Native Windows User

1. User runs `/oh-my-obsidian:setup`.
2. Plugin detects Windows.
3. Plugin checks for Obsidian and `winget`.
4. If Obsidian is missing and `winget` exists, plugin offers:

   ```powershell
   winget install -e --id Obsidian.Obsidian
   ```

5. After installation, plugin continues to the vault interview.

### UC-02. macOS User

1. Plugin detects macOS.
2. Plugin checks `/Applications/Obsidian.app` and `brew`.
3. If Obsidian is missing and Homebrew exists, plugin offers:

   ```bash
   brew install --cask obsidian
   ```

4. If Homebrew is missing, plugin points the user to the official DMG download path and pauses before continuing.

### UC-03. Debian or Ubuntu Family Linux User

1. Plugin detects Linux and reads `/etc/os-release`.
2. If the distro is Debian, Ubuntu, Linux Mint, Pop!_OS, or Zorin, plugin prefers the official `.deb` from Obsidian releases.
3. Plugin downloads the latest release asset and installs with `apt`/`dpkg`.
4. Plugin continues only after `obsidian` is callable or the user confirms manual installation.

### UC-04. Non-Debian Linux User

1. Plugin detects Linux and a non-Debian family distro.
2. Plugin prefers the official AppImage as the most distribution-neutral option.
3. Plugin stores it under a user-owned app directory, for example:

   ```text
   ~/.local/opt/obsidian/Obsidian.AppImage
   ```

4. Plugin creates a launcher only when the environment supports it.

### UC-05. WSL or Docker User on Windows

1. Plugin detects Linux but also detects WSL or container context.
2. Plugin must not install Obsidian into the Linux/container environment by default.
3. If WSL exposes `powershell.exe` or `winget.exe`, plugin may offer a host Windows command.
4. If running inside Docker, plugin prints the Windows host command and waits for the user to confirm installation outside the container.

## 6. Functional Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-001 | The setup flow must run Obsidian app preflight before asking the vault interview questions. | High |
| FR-002 | The plugin must distinguish native Linux from WSL and containerized Linux. | High |
| FR-003 | The plugin must ask before running any OS package manager command. | High |
| FR-004 | On Windows, the preferred install command must be `winget install -e --id Obsidian.Obsidian` when `winget` is available. | High |
| FR-005 | On macOS, the preferred install command must be `brew install --cask obsidian` when Homebrew is available. | High |
| FR-006 | On Debian-family Linux, the preferred automated path must be the official Obsidian `.deb` release asset. | High |
| FR-007 | On non-Debian Linux, the preferred automated path must be the official AppImage unless the user explicitly chooses another package manager. | Medium |
| FR-008 | Snap and Flatpak must be treated as fallback choices for this project because Obsidian Git needs reliable access to Git and vault files. | Medium |
| FR-009 | The plugin must continue to the vault interview if Obsidian is already installed or the user chooses to skip app installation. | High |
| FR-010 | The plugin must not create the vault before completing or explicitly skipping the Obsidian app preflight. | High |
| FR-011 | The plugin must install/configure the Obsidian Git community plugin only after the vault has been generated. | High |
| FR-012 | The plugin must document any skipped or manual installation step in the final setup output. | Medium |

## 7. Business Rules

| ID | Rule |
| --- | --- |
| BR-001 | The plugin is an onboarding orchestrator. It must reuse Obsidian and Obsidian Git rather than reimplementing desktop note editing or git sync. |
| BR-002 | The vault remains the source of truth for Obsidian-facing state after it is generated. |
| BR-003 | Obsidian app installation is host-level state, so it must be separate from vault structure generation. |
| BR-004 | Obsidian Git plugin installation is vault-level state, so it must happen inside the generated vault. |
| BR-005 | In WSL/Docker, the plugin must prefer host installation instructions over installing a GUI app into the Linux/container environment. |

## 8. UI / UX Requirements

The setup wizard should start with a short preflight section:

```text
Stage 0. Obsidian app check

Obsidian is the desktop app that will open the vault generated by this plugin.
Checking whether Obsidian is installed...
```

Detected states:

| State | UX |
| --- | --- |
| Installed | Print detected path/version if available, then continue. |
| Missing but auto-install supported | Show command, explain impact, ask for approval. |
| Missing and auto-install unsafe | Print exact manual command for the host OS, then ask user to continue after installing or skip. |
| Unknown | Ask whether to continue and remind user that Obsidian can be installed later. |

The setup wizard must make clear that Obsidian app installation is not the same as vault creation:

```text
Obsidian app: desktop viewer/editor
Generated vault: project knowledge folder
Obsidian Git: vault plugin installed after vault creation
```

## 9. Interfaces

### Claude Plugin Commands

Primary command:

```text
/oh-my-obsidian:setup
```

The setup command should internally treat Obsidian app preflight as Stage 0.

Future optional subcommand:

```text
/oh-my-obsidian:setup --skip-obsidian-install
```

Argument syntax should use Claude Code's official `$ARGUMENTS` style when command files are updated.

### Environment and State

Required vault handoff after interview:

```text
$TOOLDI_VAULT/.oh-my-obsidian/setup-state.json
```

Obsidian app install state should not be stored as a large interview payload. If needed, store a compact result:

```json
{
  "obsidianApp": {
    "checked": true,
    "status": "installed|missing|skipped|manual",
    "installMethod": "winget|brew|deb|appimage|manual|unknown"
  }
}
```

### External Services / Package Sources

| System | Purpose | Failure Handling |
| --- | --- | --- |
| Windows Package Manager (`winget`) | Preferred Windows install path. | Print manual download link if unavailable or install fails. |
| Homebrew Cask | Preferred macOS CLI install path. | Print official DMG path if unavailable. |
| Obsidian GitHub releases | Source for official Linux `.deb` and AppImage assets. | Print official download page and skip app install. |
| Snap Store | Linux fallback. | Warn that Snap is not the default for Obsidian Git workflows. |
| Flathub | Linux fallback. | Warn that Flatpak is community maintained and may require permissions for Git/vault access. |

## 10. Data Requirements

No large cross-stage data object is required.

Stage 0 may append a compact preflight result to the setup state file after the vault exists. Until then, the result can stay in command context.

After vault creation, Stage 3 owns these files:

```text
$TOOLDI_VAULT/.obsidian/community-plugins.json
$TOOLDI_VAULT/.obsidian/plugins/obsidian-git/manifest.json
$TOOLDI_VAULT/.obsidian/plugins/obsidian-git/main.js
$TOOLDI_VAULT/.obsidian/plugins/obsidian-git/styles.css
$TOOLDI_VAULT/.obsidian/plugins/obsidian-git/data.json
```

## 11. Error Handling

| Case | System Handling | User Message |
| --- | --- | --- |
| Obsidian missing and package manager missing | Do not block vault setup. Print manual install instructions and ask whether to continue. | "Obsidian can be installed later. Continue vault setup?" |
| WSL detected | Do not install Linux Obsidian by default. Offer Windows host command if available. | "This looks like WSL. Install Obsidian on Windows, not inside WSL." |
| Docker detected | Do not install desktop Obsidian inside the container. Print host install command. | "This container cannot reliably install your desktop app." |
| Linux distro unsupported | Use AppImage plan or manual instructions. | "Using the official AppImage path for this distro." |
| Package install fails | Preserve logs and allow skip. | "Installation failed. You can install manually and rerun setup." |
| Obsidian installed but Git missing | Continue app check but block Obsidian Git auto-sync setup until Git is installed. | "Obsidian exists, but Git is required for Obsidian Git sync." |

## 12. Non-Functional Requirements

| ID | Area | Requirement |
| --- | --- | --- |
| NFR-001 | Safety | The plugin must not silently install desktop software. |
| NFR-002 | Maintainability | OS install logic must stay separate from vault interview logic. |
| NFR-003 | Portability | The setup flow must work when Obsidian is installed outside the plugin's shell environment. |
| NFR-004 | Reversibility | Failed or skipped app installation must not corrupt generated vault files. |
| NFR-005 | Compatibility | The Linux default path must favor Obsidian Git compatibility over generic app sandboxing. |

## 13. Recommended OS Strategy

| Platform | Detection | Preferred Action | Fallback |
| --- | --- | --- | --- |
| Windows native | `$env:OS`, `where obsidian`, `winget list` | `winget install -e --id Obsidian.Obsidian` | Official `.exe` from Obsidian download page. |
| macOS | `uname -s = Darwin`, `/Applications/Obsidian.app` | `brew install --cask obsidian` | Official `.dmg` from Obsidian download page. |
| Debian/Ubuntu/Mint/Pop/Zorin | `/etc/os-release`, `ID`/`ID_LIKE` | Official `.deb` from Obsidian GitHub releases | AppImage. |
| Arch/Manjaro | `/etc/os-release` | AppImage by default | AUR only if the user explicitly opts in and `yay`/`paru` exists. |
| Fedora/RHEL/Rocky/openSUSE | `/etc/os-release` | AppImage by default | Flatpak or Snap only with warning and user opt-in. |
| WSL | `/proc/version` or `/proc/sys/kernel/osrelease` contains Microsoft/WSL | Install on Windows host via user-run `winget` command | Manual Windows install. |
| Docker/container | `/.dockerenv`, cgroup markers | Do not install app in container | Print host-specific command. |

## 14. First Implementation Scope: macOS Claude Plugin Stage

The first implementation target is macOS only.

Assumptions:

- The `oh-my-obsidian` Claude Code plugin is already installed or loaded.
- The user starts `/oh-my-obsidian:setup`.
- The setup command runs Obsidian app preflight before Q1 vault path.
- The setup command does not create the vault until preflight is completed or skipped.

The implementation entry point is:

```bash
scripts/obsidian-app-preflight.sh check
```

The script returns a stable JSON object:

```json
{
  "schema": "oh-my-obsidian/obsidian-app-preflight/v1",
  "action": "check",
  "platform": "macos",
  "context": "native",
  "obsidian": {
    "installed": true,
    "path": "/Applications/Obsidian.app",
    "version": "1.x.x"
  },
  "cli": {
    "availableOnPath": false,
    "path": "",
    "bundledCliAvailable": true,
    "bundledCliPath": "/Applications/Obsidian.app/Contents/MacOS/obsidian-cli"
  },
  "packageManagers": {
    "homebrew": {
      "available": true,
      "path": "/opt/homebrew/bin/brew",
      "hasObsidianCask": true
    }
  },
  "recommendation": {
    "canAutoInstall": true,
    "installMethod": "homebrew-cask",
    "installCommand": "brew install --cask obsidian",
    "manualUrl": "https://obsidian.md/download"
  }
}
```

The setup command owns user interaction:

1. Read the JSON preflight result.
2. If Obsidian is installed, continue to the interview.
3. If Obsidian is missing and Homebrew is available, ask for approval to run:

   ```bash
   scripts/obsidian-app-preflight.sh install
   ```

4. If Obsidian is missing and Homebrew is unavailable, show the manual download URL and ask whether to continue with "install later".
5. If not macOS, say this first implementation only supports macOS auto-install and allow an explicit skip.

The script owns machine probing and host action execution:

| Action | Responsibility |
| --- | --- |
| `check` | Detect platform/context, Obsidian app, Homebrew, and recommended next step. |
| `install` | On native macOS only, run `brew install --cask obsidian` when Obsidian is missing. |
| `open-vault <path>` | On native macOS only, open the vault with the Obsidian URI scheme `obsidian://open?path=...`; fall back to `open -a "Obsidian" <path>` if URL encoding is unavailable. |

Future OS support should add provider implementations behind the same actions rather than changing the setup command contract.

## 15. Open Questions

| ID | Question | Needed Decision |
| --- | --- | --- |
| OQ-001 | Should Stage 0 block setup if Obsidian is missing, or allow "install later" by default? | Product decision. |
| OQ-002 | Should Linux Snap be offered on Ubuntu as a visible option despite Obsidian Git sandbox concerns? | Product/engineering decision. |
| OQ-003 | Should the plugin try to open the generated vault automatically after setup? | Product decision; depends on OS/context. |
| OQ-004 | Should `TOOLDI_VAULT` replace all current `OBSIDIAN_VAULT` references? | Engineering cleanup decision. |

## 16. Risks / Design Debt

| ID | Item | Impact |
| --- | --- | --- |
| RD-001 | Running inside WSL or Docker can make desktop app detection misleading. | High |
| RD-002 | Linux packaging is fragmented; one command cannot be correct for every distro. | Medium |
| RD-003 | Snap/Flatpak sandboxing can interfere with Git or filesystem access needed by Obsidian Git. | Medium |
| RD-004 | Current repo command files use `{{ARGUMENTS}}`, while Claude Code docs use `$ARGUMENTS`. | Medium |
| RD-005 | Current repo uses both `TOOLDI_VAULT` and `OBSIDIAN_VAULT` in different files. | Medium |

## 17. Implementation Trace

Repo files inspected:

- `README.md`
- `SPEC.md`
- `commands/setup.md`
- `commands/recall.md`
- `commands/session-save.md`
- `commands/vault.md`
- `skills/recall/SKILL.md`
- `skills/session-save/SKILL.md`
- `skills/obsidian-vault-manager/SKILL.md`
- `hooks/hooks.json`
- `hooks/stop-hook.sh`
- `scripts/install.sh`
- `scripts/install.ps1`
- `scripts/obsidian-app-preflight.sh`

External references checked:

- Obsidian install help: https://obsidian.md/help/install
- Obsidian URI help: https://obsidian.md/help/uri
- Obsidian CLI help: https://obsidian.md/help/cli
- Obsidian download page: https://obsidian.md/download
- Obsidian GitHub releases: https://github.com/obsidianmd/obsidian-releases/releases
- Homebrew cask for Obsidian: https://formulae.brew.sh/cask/obsidian
- Snap Store Obsidian page: https://snapcraft.io/obsidian
- Windows package manifest repository: https://github.com/microsoft/winget-pkgs/tree/master/manifests/o/Obsidian/Obsidian
- Obsidian Git plugin: https://github.com/Vinzent03/obsidian-git
- Obsidian Git installation docs: https://github.com/Vinzent03/obsidian-git/blob/master/docs/Installation.md
