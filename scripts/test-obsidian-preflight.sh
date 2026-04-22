#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

pass() {
  printf 'ok - %s\n' "$1"
}

fail() {
  printf 'not ok - %s\n' "$1" >&2
  exit 1
}

run_json_test() {
  local name="$1"
  local command="$2"
  local filter="$3"
  local output

  output="$(eval "$command")"
  if jq -e "$filter" >/dev/null <<<"$output"; then
    pass "$name"
  else
    printf '%s\n' "$output" >&2
    fail "$name"
  fi
}

cd "$ROOT_DIR"

bash -n scripts/obsidian-app-preflight.sh
pass "bash preflight 스크립트 문법이 유효하다"

node --check scripts/obsidian-app-preflight.mjs >/dev/null
pass "node preflight wrapper 문법이 유효하다"

node --check bin/obsidian-app-preflight >/dev/null
pass "plugin bin preflight 명령 문법이 유효하다"

common_json_contract='
  .schema == "oh-my-obsidian/obsidian-app-preflight/v1"
  and .action == "check"
  and (.platform | type == "string")
  and (.context | type == "string")
  and (.obsidian.installed | type == "boolean")
  and (.recommendation.canAutoInstall | type == "boolean")
  and (.recommendation.installMethod | type == "string")
  and (.recommendation.manualUrl == "https://obsidian.md/download")
'

run_json_test \
  "plugin bin preflight가 공통 JSON 계약을 반환한다" \
  'PATH="$ROOT_DIR/bin:$PATH" CLAUDE_PLUGIN_ROOT="$ROOT_DIR" obsidian-app-preflight check' \
  "$common_json_contract"

run_json_test \
  "node wrapper가 CLAUDE_PLUGIN_ROOT 기준으로 helper를 찾는다" \
  'CLAUDE_PLUGIN_ROOT="$ROOT_DIR" node scripts/obsidian-app-preflight.mjs check' \
  "$common_json_contract"

if command -v powershell.exe >/dev/null 2>&1; then
  ps_script="$(wslpath -w "$ROOT_DIR/scripts/obsidian-app-preflight.ps1" 2>/dev/null || true)"
  if [ -n "$ps_script" ]; then
    run_json_test \
      "windows powershell provider가 공통 JSON 계약을 반환한다" \
      'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$ps_script" -Action check | tr -d "\r"' \
      "$common_json_contract"
  fi
fi

if command -v docker >/dev/null 2>&1; then
  run_json_test \
    "container context에서는 desktop 설치가 비활성화된다" \
    'docker run --rm -v "$ROOT_DIR/scripts:/tmp/scripts:ro" ubuntu:24.04 bash -lc "bash /tmp/scripts/obsidian-app-preflight.sh check"' \
    "$common_json_contract and .context == \"container\" and .recommendation.canAutoInstall == false"

  if docker run --rm -v "$ROOT_DIR/scripts:/tmp/scripts:ro" ubuntu:24.04 bash -lc "bash /tmp/scripts/obsidian-app-preflight.sh install" >/tmp/oh-my-obsidian-container-install.out 2>&1; then
    cat /tmp/oh-my-obsidian-container-install.out >&2
    fail "container context에서는 install이 실패해야 한다"
  else
    pass "container context에서는 install이 실패한다"
  fi
fi

if grep -q 'Obsidian app preflight' commands/setup.md \
  && grep -q 'obsidian-app-preflight check' commands/setup.md \
  && grep -q 'Do not create a vault until Obsidian app preflight' commands/setup.md; then
  pass "setup command는 vault 인터뷰 전에 preflight를 요구한다"
else
  fail "setup command는 vault 인터뷰 전에 preflight를 요구한다"
fi
