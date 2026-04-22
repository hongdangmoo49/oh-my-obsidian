#!/usr/bin/env bash
# oh-my-obsidian Obsidian app preflight.
# This script is intended to be called by the Claude Code plugin setup flow.

set -euo pipefail

ACTION="${1:-check}"
VAULT_PATH="${2:-}"

json_escape() {
  local value="${1:-}"
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//$'\n'/\\n}
  value=${value//$'\r'/}
  printf '%s' "$value"
}

json_bool() {
  if [ "${1:-}" = "true" ]; then
    printf 'true'
  else
    printf 'false'
  fi
}

detect_context() {
  if [ -f "/.dockerenv" ]; then
    printf 'container'
    return
  fi

  if [ -r /proc/sys/kernel/osrelease ] && grep -qiE 'microsoft|wsl' /proc/sys/kernel/osrelease; then
    printf 'wsl'
    return
  fi

  printf 'native'
}

macos_obsidian_path() {
  local candidates=(
    "/Applications/Obsidian.app"
    "$HOME/Applications/Obsidian.app"
  )

  local app
  for app in "${candidates[@]}"; do
    if macos_valid_obsidian_bundle "$app"; then
      printf '%s' "$app"
      return 0
    fi
  done

  if command -v mdfind >/dev/null 2>&1; then
    while IFS= read -r app; do
      if macos_valid_obsidian_bundle "$app"; then
        printf '%s' "$app"
        return 0
      fi
    done < <(mdfind 'kMDItemCFBundleIdentifier == "md.obsidian"' 2>/dev/null)
    return 0
  fi
}

macos_bundle_identifier() {
  local app_path="$1"
  local plist="$app_path/Contents/Info.plist"

  if [ -f "$plist" ] && [ -x /usr/libexec/PlistBuddy ]; then
    /usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist" 2>/dev/null || true
  fi
}

macos_valid_obsidian_bundle() {
  local app_path="${1:-}"
  [ -n "$app_path" ] || return 1
  [ -d "$app_path" ] || return 1
  [ "$(macos_bundle_identifier "$app_path")" = "md.obsidian" ]
}

macos_obsidian_version() {
  local app_path="$1"
  local plist="$app_path/Contents/Info.plist"

  if [ -f "$plist" ] && [ -x /usr/libexec/PlistBuddy ]; then
    /usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist" 2>/dev/null || true
  fi
}

uri_encode() {
  local value="$1"

  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$value"
    return
  fi

  return 1
}

powershell_json_string() {
  local command="$1"

  if ! command -v powershell.exe >/dev/null 2>&1; then
    printf ''
    return 1
  fi

  powershell.exe -NoProfile -Command "$command" 2>/dev/null | tr -d '\r' | tail -1
}

windows_host_check() {
  local context winget_available uri_registered cli_available cli_path installed can_auto_install install_method install_command
  context="${1:-wsl}"

  winget_available="$(powershell_json_string 'if (Get-Command winget -ErrorAction SilentlyContinue) { "true" } else { "false" }' || printf false)"
  uri_registered="$(powershell_json_string 'if (Test-Path "Registry::HKEY_CLASSES_ROOT\obsidian") { "true" } else { "false" }' || printf false)"
  cli_path="$(powershell_json_string '$cmd = Get-Command obsidian,Obsidian.com -ErrorAction SilentlyContinue | Select-Object -First 1; if ($cmd) { $cmd.Source } else { "" }' || true)"
  cli_available=false
  if [ -n "$cli_path" ]; then
    cli_available=true
  fi

  installed=false
  if [ "$uri_registered" = "true" ] || [ "$cli_available" = "true" ]; then
    installed=true
  fi

  can_auto_install=false
  install_method="manual-exe"
  install_command=""
  if [ "$winget_available" = "true" ]; then
    can_auto_install=true
    install_method="winget"
    install_command="winget install --id Obsidian.Obsidian -e --source winget --scope user --accept-source-agreements --accept-package-agreements"
  fi

  cat <<JSON
{
  "schema": "oh-my-obsidian/obsidian-app-preflight/v1",
  "action": "check",
  "platform": "windows",
  "context": "$(json_escape "$context")",
  "obsidian": {
    "installed": $(json_bool "$installed"),
    "path": "",
    "version": ""
  },
  "cli": {
    "availableOnPath": $(json_bool "$cli_available"),
    "path": "$(json_escape "$cli_path")",
    "bundledCliAvailable": false,
    "bundledCliPath": ""
  },
  "packageManagers": {
    "winget": {
      "available": $(json_bool "$winget_available"),
      "packageId": "Obsidian.Obsidian"
    }
  },
  "uri": {
    "obsidianProtocolRegistered": $(json_bool "$uri_registered")
  },
  "recommendation": {
    "canAutoInstall": $(json_bool "$can_auto_install"),
    "installMethod": "$(json_escape "$install_method")",
    "installCommand": "$(json_escape "$install_command")",
    "manualUrl": "https://obsidian.md/download"
  }
}
JSON
}

windows_host_install() {
  if ! command -v powershell.exe >/dev/null 2>&1; then
    printf 'PowerShell host access is unavailable. Install manually: https://obsidian.md/download\n' >&2
    return 3
  fi

  powershell.exe -NoProfile -Command 'winget install --id Obsidian.Obsidian -e --source winget --scope user --accept-source-agreements --accept-package-agreements'
}

windows_host_open_vault() {
  if [ -z "$VAULT_PATH" ]; then
    printf 'Vault path is required for open-vault.\n' >&2
    return 2
  fi

  if ! command -v powershell.exe >/dev/null 2>&1; then
    printf 'PowerShell host access is unavailable.\n' >&2
    return 3
  fi

  local windows_path="$VAULT_PATH"
  if command -v wslpath >/dev/null 2>&1; then
    windows_path="$(wslpath -w "$VAULT_PATH" 2>/dev/null || printf '%s' "$VAULT_PATH")"
  fi

  OH_MY_OBSIDIAN_WINDOWS_VAULT="$windows_path" \
    powershell.exe -NoProfile -Command '$path = [uri]::EscapeDataString($env:OH_MY_OBSIDIAN_WINDOWS_VAULT); Start-Process "obsidian://open?path=$path"'
}

macos_check() {
  local context obsidian_path obsidian_version brew_path brew_has_obsidian installed brew_available cli_path bundled_cli_path cli_available bundled_cli_available
  context="$(detect_context)"
  obsidian_path="$(macos_obsidian_path || true)"
  obsidian_version=""
  installed=false

  if [ -n "$obsidian_path" ] && [ -d "$obsidian_path" ]; then
    installed=true
    obsidian_version="$(macos_obsidian_version "$obsidian_path")"
  fi

  brew_path="$(command -v brew || true)"
  brew_available=false
  brew_has_obsidian=false
  if [ -n "$brew_path" ]; then
    brew_available=true
    if brew list --cask obsidian >/dev/null 2>&1; then
      brew_has_obsidian=true
    fi
  fi

  cli_path="$(command -v obsidian || true)"
  cli_available=false
  if [ -n "$cli_path" ]; then
    cli_available=true
  fi

  bundled_cli_path=""
  bundled_cli_available=false
  if [ -n "$obsidian_path" ] && [ -x "$obsidian_path/Contents/MacOS/obsidian-cli" ]; then
    bundled_cli_path="$obsidian_path/Contents/MacOS/obsidian-cli"
    bundled_cli_available=true
  fi

  cat <<JSON
{
  "schema": "oh-my-obsidian/obsidian-app-preflight/v1",
  "action": "check",
  "platform": "macos",
  "context": "$(json_escape "$context")",
  "obsidian": {
    "installed": $(json_bool "$installed"),
    "path": "$(json_escape "$obsidian_path")",
    "version": "$(json_escape "$obsidian_version")"
  },
  "cli": {
    "availableOnPath": $(json_bool "$cli_available"),
    "path": "$(json_escape "$cli_path")",
    "bundledCliAvailable": $(json_bool "$bundled_cli_available"),
    "bundledCliPath": "$(json_escape "$bundled_cli_path")"
  },
  "packageManagers": {
    "homebrew": {
      "available": $(json_bool "$brew_available"),
      "path": "$(json_escape "$brew_path")",
      "hasObsidianCask": $(json_bool "$brew_has_obsidian")
    }
  },
  "recommendation": {
    "canAutoInstall": $(json_bool "$brew_available"),
    "installMethod": "$(if [ "$brew_available" = "true" ]; then printf 'homebrew-cask'; else printf 'manual-dmg'; fi)",
    "installCommand": "$(if [ "$brew_available" = "true" ]; then printf 'brew install --cask obsidian'; fi)",
    "manualUrl": "https://obsidian.md/download"
  }
}
JSON
}

macos_install() {
  if [ "$(uname -s)" != "Darwin" ]; then
    printf 'macOS install is only supported on Darwin hosts.\n' >&2
    return 2
  fi

  if [ -n "$(macos_obsidian_path || true)" ]; then
    printf 'Obsidian is already installed.\n'
    return 0
  fi

  if ! command -v brew >/dev/null 2>&1; then
    printf 'Homebrew is required for automatic install. Install manually: https://obsidian.md/download\n' >&2
    return 3
  fi

  brew install --cask obsidian
}

macos_open_vault() {
  if [ "$(uname -s)" != "Darwin" ]; then
    printf 'Opening Obsidian is only supported on Darwin hosts.\n' >&2
    return 2
  fi

  if [ -z "$VAULT_PATH" ]; then
    printf 'Vault path is required for open-vault.\n' >&2
    return 2
  fi

  if [ ! -d "$VAULT_PATH" ]; then
    printf 'Vault path does not exist: %s\n' "$VAULT_PATH" >&2
    return 2
  fi

  local encoded_path
  encoded_path="$(uri_encode "$VAULT_PATH" || true)"

  if [ -n "$encoded_path" ]; then
    open "obsidian://open?path=$encoded_path"
  else
    open -a "Obsidian" "$VAULT_PATH"
  fi
}

linux_os_value() {
  local key="$1"

  (
    if [ -r /etc/os-release ]; then
      . /etc/os-release
    elif [ -r /usr/lib/os-release ]; then
      . /usr/lib/os-release
    fi
    eval "printf '%s' \"\${$key:-}\""
  )
}

linux_is_debian_like() {
  local id id_like
  id="$(linux_os_value ID)"
  id_like="$(linux_os_value ID_LIKE)"

  case "$id $id_like" in
    *debian*|*ubuntu*) return 0 ;;
    *) return 1 ;;
  esac
}

linux_release_asset_url() {
  local pattern="$1"

  command -v curl >/dev/null 2>&1 || return 1
  command -v jq >/dev/null 2>&1 || return 1

  curl -fsSL https://api.github.com/repos/obsidianmd/obsidian-releases/releases/latest \
    | jq -r --arg pattern "$pattern" '.assets[] | select(.name | test($pattern)) | .browser_download_url' \
    | head -1
}

linux_install_method() {
  local context arch
  context="$(detect_context)"
  arch="$(uname -m)"

  if [ "$context" != "native" ]; then
    printf 'host-required'
    return
  fi

  if linux_is_debian_like && [ "$arch" = "x86_64" ] && command -v apt >/dev/null 2>&1 && command -v curl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
    printf 'deb'
    return
  fi

  if command -v curl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
    printf 'appimage'
    return
  fi

  if command -v snap >/dev/null 2>&1; then
    printf 'snap-classic'
    return
  fi

  if command -v flatpak >/dev/null 2>&1; then
    printf 'flatpak'
    return
  fi

  printf 'manual'
}

linux_check() {
  local context id id_like version_id arch installed obsidian_path cli_available cli_path xdg_open_available uri_handler apt_available snap_available flatpak_available method can_auto_install install_command appimage_name
  context="$(detect_context)"
  id="$(linux_os_value ID)"
  id_like="$(linux_os_value ID_LIKE)"
  version_id="$(linux_os_value VERSION_ID)"
  arch="$(uname -m)"

  obsidian_path="$(command -v obsidian || true)"
  installed=false
  if [ -n "$obsidian_path" ]; then
    installed=true
  elif command -v dpkg >/dev/null 2>&1 && dpkg -s obsidian >/dev/null 2>&1; then
    installed=true
    obsidian_path="/usr/bin/obsidian"
  elif command -v snap >/dev/null 2>&1 && snap list obsidian >/dev/null 2>&1; then
    installed=true
    obsidian_path="snap:obsidian"
  elif command -v flatpak >/dev/null 2>&1 && flatpak info md.obsidian.Obsidian >/dev/null 2>&1; then
    installed=true
    obsidian_path="flatpak:md.obsidian.Obsidian"
  fi

  cli_path="$HOME/.local/bin/obsidian"
  cli_available=false
  if [ -x "$cli_path" ]; then
    cli_available=true
  else
    cli_path=""
  fi

  xdg_open_available=false
  if command -v xdg-open >/dev/null 2>&1; then
    xdg_open_available=true
  fi

  uri_handler=""
  if command -v xdg-mime >/dev/null 2>&1; then
    uri_handler="$(xdg-mime query default x-scheme-handler/obsidian 2>/dev/null || true)"
  fi

  apt_available=false
  snap_available=false
  flatpak_available=false
  command -v apt >/dev/null 2>&1 && apt_available=true
  command -v snap >/dev/null 2>&1 && snap_available=true
  command -v flatpak >/dev/null 2>&1 && flatpak_available=true

  method="$(linux_install_method)"
  can_auto_install=true
  case "$method" in
    deb) install_command="download latest obsidian_<version>_amd64.deb and run: sudo apt install ./obsidian_<version>_amd64.deb" ;;
    appimage)
      appimage_name="Obsidian-<version>.AppImage"
      if [ "$arch" = "aarch64" ] || [ "$arch" = "arm64" ]; then
        appimage_name="Obsidian-<version>-arm64.AppImage"
      fi
      install_command="download latest $appimage_name to ~/.local/opt/obsidian/Obsidian.AppImage and chmod +x"
      ;;
    snap-classic) install_command="sudo snap install obsidian --classic" ;;
    flatpak) install_command="flatpak install flathub md.obsidian.Obsidian" ;;
    *) install_command=""; can_auto_install=false ;;
  esac

  cat <<JSON
{
  "schema": "oh-my-obsidian/obsidian-app-preflight/v1",
  "action": "check",
  "platform": "linux",
  "context": "$(json_escape "$context")",
  "distro": {
    "id": "$(json_escape "$id")",
    "idLike": "$(json_escape "$id_like")",
    "versionId": "$(json_escape "$version_id")",
    "arch": "$(json_escape "$arch")"
  },
  "obsidian": {
    "installed": $(json_bool "$installed"),
    "path": "$(json_escape "$obsidian_path")",
    "version": ""
  },
  "cli": {
    "availableOnPath": $(json_bool "$cli_available"),
    "path": "$(json_escape "$cli_path")",
    "bundledCliAvailable": false,
    "bundledCliPath": ""
  },
  "packageManagers": {
    "apt": { "available": $(json_bool "$apt_available") },
    "snap": { "available": $(json_bool "$snap_available") },
    "flatpak": { "available": $(json_bool "$flatpak_available") }
  },
  "uri": {
    "xdgOpenAvailable": $(json_bool "$xdg_open_available"),
    "obsidianHandler": "$(json_escape "$uri_handler")"
  },
  "recommendation": {
    "canAutoInstall": $(json_bool "$can_auto_install"),
    "installMethod": "$(json_escape "$method")",
    "installCommand": "$(json_escape "$install_command")",
    "manualUrl": "https://obsidian.md/download"
  }
}
JSON
}

linux_install() {
  local context method arch asset_url tmp target
  context="$(detect_context)"
  if [ "$context" != "native" ]; then
    printf 'Linux desktop install is disabled for context=%s. Install on the host desktop instead.\n' "$context" >&2
    return 3
  fi

  method="$(linux_install_method)"
  arch="$(uname -m)"

  case "$method" in
    deb)
      asset_url="$(linux_release_asset_url '^obsidian_[0-9.]+_amd64\.deb$')"
      [ -n "$asset_url" ] || { printf 'Could not resolve latest Obsidian .deb asset.\n' >&2; return 3; }
      tmp="$(mktemp --suffix=.deb)"
      curl -fL "$asset_url" -o "$tmp"
      sudo apt install -y "$tmp"
      ;;
    appimage)
      if [ "$arch" = "aarch64" ] || [ "$arch" = "arm64" ]; then
        asset_url="$(linux_release_asset_url '^Obsidian-[0-9.]+-arm64\.AppImage$')"
      else
        asset_url="$(linux_release_asset_url '^Obsidian-[0-9.]+\.AppImage$')"
      fi
      [ -n "$asset_url" ] || { printf 'Could not resolve latest Obsidian AppImage asset.\n' >&2; return 3; }
      target="$HOME/.local/opt/obsidian/Obsidian.AppImage"
      mkdir -p "$(dirname "$target")" "$HOME/.local/bin"
      curl -fL "$asset_url" -o "$target"
      chmod u+x "$target"
      ln -sf "$target" "$HOME/.local/bin/obsidian-app"
      printf 'Installed Obsidian AppImage at %s\n' "$target"
      ;;
    snap-classic)
      sudo snap install obsidian --classic
      ;;
    flatpak)
      flatpak install -y flathub md.obsidian.Obsidian
      ;;
    *)
      printf 'No automatic Linux install method is available. Install manually: https://obsidian.md/download\n' >&2
      return 3
      ;;
  esac
}

linux_open_vault() {
  if [ -z "$VAULT_PATH" ]; then
    printf 'Vault path is required for open-vault.\n' >&2
    return 2
  fi

  if ! command -v xdg-open >/dev/null 2>&1; then
    printf 'xdg-open is required to open Obsidian URI on Linux.\n' >&2
    return 3
  fi

  local vault_name encoded_vault
  vault_name="$(basename "$VAULT_PATH")"
  encoded_vault="$(uri_encode "$vault_name" || true)"
  if [ -z "$encoded_vault" ]; then
    printf 'Could not encode vault name for Obsidian URI.\n' >&2
    return 3
  fi

  xdg-open "obsidian://open?vault=$encoded_vault"
}

unsupported_platform_check() {
  local platform context
  platform="$(uname -s 2>/dev/null || printf unknown)"
  context="$(detect_context)"
  cat <<JSON
{
  "schema": "oh-my-obsidian/obsidian-app-preflight/v1",
  "action": "check",
  "platform": "$(json_escape "$platform")",
  "context": "$(json_escape "$context")",
  "obsidian": {
    "installed": false,
    "path": "",
    "version": ""
  },
  "cli": {
    "availableOnPath": false,
    "path": "",
    "bundledCliAvailable": false,
    "bundledCliPath": ""
  },
  "packageManagers": {
  },
  "recommendation": {
    "canAutoInstall": false,
    "installMethod": "unsupported-in-this-version",
    "installCommand": "",
    "manualUrl": "https://obsidian.md/download"
  }
}
JSON
}

main() {
  local kernel context
  kernel="$(uname -s 2>/dev/null || true)"
  context="$(detect_context)"

  case "$kernel" in
    Darwin)
      case "$ACTION" in
        check) macos_check ;;
        install) macos_install ;;
        open-vault) macos_open_vault ;;
        *)
          printf 'Unknown action: %s\n' "$ACTION" >&2
          return 2
          ;;
      esac
      ;;
    Linux)
      if [ "$context" = "wsl" ]; then
        case "$ACTION" in
          check) windows_host_check "wsl" ;;
          install) windows_host_install ;;
          open-vault) windows_host_open_vault ;;
          *)
            printf 'Unknown action: %s\n' "$ACTION" >&2
            return 2
            ;;
        esac
      elif [ "$context" = "container" ]; then
        case "$ACTION" in
          check) unsupported_platform_check ;;
          install|open-vault)
            printf 'Desktop Obsidian install/open is disabled inside containers.\n' >&2
            return 2
            ;;
          *)
            printf 'Unknown action: %s\n' "$ACTION" >&2
            return 2
            ;;
        esac
      else
        case "$ACTION" in
          check) linux_check ;;
          install) linux_install ;;
          open-vault) linux_open_vault ;;
          *)
            printf 'Unknown action: %s\n' "$ACTION" >&2
            return 2
            ;;
        esac
      fi
      ;;
    MINGW*|MSYS*|CYGWIN*)
      case "$ACTION" in
        check) windows_host_check "native-bash" ;;
        install) windows_host_install ;;
        open-vault) windows_host_open_vault ;;
        *)
          printf 'Unknown action: %s\n' "$ACTION" >&2
          return 2
          ;;
      esac
      ;;
    *)
      case "$ACTION" in
        check) unsupported_platform_check ;;
        install|open-vault)
          printf 'Obsidian desktop install/open is not implemented for this platform.\n' >&2
          return 2
          ;;
        *)
          printf 'Unknown action: %s\n' "$ACTION" >&2
          return 2
          ;;
      esac
      ;;
  esac
}

main
