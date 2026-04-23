#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  printf 'usage: %s <vault-path> [expected-status]\n' "$0" >&2
  exit 2
fi

vault_path="$1"
expected_status="${2:-}"
state_path="$vault_path/.oh-my-obsidian/setup-state.json"

command -v jq >/dev/null 2>&1 || { printf 'jq is required\n' >&2; exit 2; }
command -v realpath >/dev/null 2>&1 || { printf 'realpath is required\n' >&2; exit 2; }

[ -f "$state_path" ] || { printf 'missing setup-state: %s\n' "$state_path" >&2; exit 1; }

actual_realpath="$(realpath "$vault_path")"

jq -e '.schema == "oh-my-obsidian/setup-state/v1"' "$state_path" >/dev/null
jq -e '.status | IN("in_progress","complete","failed","action_required_env")' "$state_path" >/dev/null
jq -e --arg rp "$actual_realpath" '.vaultRealPath == $rp' "$state_path" >/dev/null
jq -e '.managedArtifacts | type == "array"' "$state_path" >/dev/null

if [ -n "$expected_status" ]; then
  jq -e --arg status "$expected_status" '.status == $status' "$state_path" >/dev/null
fi

while IFS= read -r relpath; do
  [ -n "$relpath" ] || continue
  if [ ! -e "$vault_path/$relpath" ]; then
    printf 'applied artifact missing: %s\n' "$relpath" >&2
    exit 1
  fi
done < <(jq -r '.managedArtifacts[] | select(.applied == true) | .relativePath' "$state_path")

printf 'ok - setup-state validated: %s\n' "$state_path"
