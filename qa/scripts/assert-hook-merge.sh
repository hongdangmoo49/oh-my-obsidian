#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  printf 'usage: %s <hooks.json> <expected-command> [preserved-command]\n' "$0" >&2
  exit 2
fi

hooks_json="$1"
expected_command="$2"
preserved_command="${3:-}"

command -v jq >/dev/null 2>&1 || { printf 'jq is required\n' >&2; exit 2; }
[ -f "$hooks_json" ] || { printf 'missing hooks file: %s\n' "$hooks_json" >&2; exit 1; }

jq -e '.hooks | type == "object"' "$hooks_json" >/dev/null
jq -e '.hooks.Stop | type == "array"' "$hooks_json" >/dev/null

expected_count="$(jq -r --arg cmd "$expected_command" '[.hooks.Stop[]?.hooks[]? | select(.command == $cmd)] | length' "$hooks_json")"
[ "$expected_count" = "1" ] || {
  printf 'expected hook command exactly once, got %s\n' "$expected_count" >&2
  exit 1
}

if [ -n "$preserved_command" ]; then
  preserved_count="$(jq -r --arg cmd "$preserved_command" '[.hooks.Stop[]?.hooks[]? | select(.command == $cmd)] | length' "$hooks_json")"
  [ "$preserved_count" -ge 1 ] || {
    printf 'preserved Stop hook command missing: %s\n' "$preserved_command" >&2
    exit 1
  }
fi

printf 'ok - hook merge validated: %s\n' "$hooks_json"
