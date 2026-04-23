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

run_broken_macos_preflight() {
  local tmp
  tmp="$(mktemp -d)"
  mkdir -p "$tmp/bin"

  cat > "$tmp/bin/uname" <<'EOF'
#!/usr/bin/env bash
if [ "${1:-}" = "-s" ]; then
  printf 'Darwin\n'
elif [ "${1:-}" = "-m" ]; then
  printf 'arm64\n'
else
  printf 'Darwin\n'
fi
EOF

  cat > "$tmp/bin/git" <<'EOF'
#!/usr/bin/env bash
if [ "${1:-}" = "--version" ]; then
  printf 'git version 2.41.0\n'
  exit 0
fi
exit 0
EOF

  cat > "$tmp/bin/xcode-select" <<'EOF'
#!/usr/bin/env bash
if [ "${1:-}" = "-p" ]; then
  printf '/Library/Developer/CommandLineTools\n'
  exit 0
fi
exit 1
EOF

  cat > "$tmp/bin/system-git" <<'EOF'
#!/usr/bin/env bash
printf 'xcrun: error: invalid active developer path (/Library/Developer/CommandLineTools), missing xcrun at: /Library/Developer/CommandLineTools/usr/bin/xcrun\n' >&2
exit 1
EOF

  chmod +x "$tmp/bin/uname" "$tmp/bin/git" "$tmp/bin/xcode-select" "$tmp/bin/system-git"
  PATH="$tmp/bin:$PATH" OH_MY_OBSIDIAN_SYSTEM_GIT_PATH="$tmp/bin/system-git" \
    bash scripts/obsidian-app-preflight.sh check
  rm -rf "$tmp"
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
  and (.git.status | type == "string")
  and (.git.availableOnPath | type == "boolean")
  and (.git.issue | type == "string")
  and (.recommendation.canAutoInstall | type == "boolean")
  and (.recommendation.installMethod | type == "string")
  and (.recommendation.manualUrl == "https://obsidian.md/download")
'

run_json_test \
  "plugin bin preflight가 공통 JSON 계약을 반환한다" \
  'PATH="$ROOT_DIR/bin:$PATH" CLAUDE_PLUGIN_ROOT="$ROOT_DIR" obsidian-app-preflight check' \
  "$common_json_contract"

run_json_test \
  "macOS preflight는 broken developer path를 git 상태로 노출한다" \
  'run_broken_macos_preflight' \
  "$common_json_contract and .platform == \"macos\" and .git.status == \"broken-path\" and .git.fixCommand == \"xcode-select --install\""

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

if grep -q 'git.fixCommand' commands/setup.md \
  && grep -q 'continue setup without git initialization' commands/setup.md \
  && grep -q 'fix the git issue first and rerun preflight' commands/setup.md \
  && grep -q 'do not offer automatic `team-sync` until the git issue is fixed' commands/setup.md \
  && grep -q 'pending until the user runs `git.fixCommand`' commands/setup.md \
  && grep -q 'obsidian-app-preflight check' commands/setup.md; then
  pass "setup command는 git preflight 문제에 대해 재시도 또는 비-git 진행 흐름을 명시한다"
else
  fail "setup command는 git preflight 문제에 대해 재시도 또는 비-git 진행 흐름을 명시한다"
fi
