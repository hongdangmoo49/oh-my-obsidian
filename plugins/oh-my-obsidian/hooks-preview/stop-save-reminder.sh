#!/usr/bin/env bash
set -euo pipefail

exec 2>/dev/null

NOOP='{"continue":true}'
VAULT="${OBSIDIAN_VAULT:-}"

if [ -z "$VAULT" ]; then
  printf '%s\n' "$NOOP"
  exit 0
fi

if ! command -v python3 >/dev/null 2>&1; then
  printf '%s\n' "$NOOP"
  exit 0
fi

python3 - "$VAULT" <<'PY'
import json
import sys
from pathlib import Path

noop = {"continue": True}

try:
    vault = Path(sys.argv[1]).expanduser().resolve()
except Exception:
    print(json.dumps(noop))
    raise SystemExit

state_path = vault / ".oh-my-obsidian" / "setup-state.json"
if not state_path.is_file():
    print(json.dumps(noop))
    raise SystemExit

try:
    state = json.loads(state_path.read_text(encoding="utf-8"))
except Exception:
    print(json.dumps(noop))
    raise SystemExit

if state.get("status") != "complete":
    print(json.dumps(noop))
    raise SystemExit

if state.get("vaultRealPath") != str(vault):
    print(json.dumps(noop))
    raise SystemExit

print(
    json.dumps(
        {
            "continue": True,
            "systemMessage": "Save this session to Obsidian with oh-my-obsidian session-save when useful."
        }
    )
)
PY
