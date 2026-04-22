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
  case "$(uname -s 2>/dev/null || true)" in
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
    *)
      case "$ACTION" in
        check) unsupported_platform_check ;;
        install|open-vault)
          printf 'Only macOS is implemented in this first plugin setup scope.\n' >&2
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
