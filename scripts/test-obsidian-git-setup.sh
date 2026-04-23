#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

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
  local expected_status="${4:-0}"

  set +e
  output="$(eval "$command")"
  local command_status=$?
  set -e

  if [ "$command_status" -ne "$expected_status" ]; then
    printf 'expected exit %s, got %s\n' "$expected_status" "$command_status" >&2
    printf '%s\n' "$output" >&2
    fail "$name"
  fi

  if jq -e "$filter" >/dev/null <<<"$output"; then
    pass "$name"
  else
    printf '%s\n' "$output" >&2
    fail "$name"
  fi
}

create_fixture_zip() {
  local version="${1:-9.9.9}"
  local plugin_id="${2:-obsidian-git}"
  local main_mode="${3:-present}"
  local fixture_dir="$TMP_DIR/fixture-$version-$plugin_id-$main_mode"
  local zip_path="$TMP_DIR/obsidian-git-$version-$plugin_id-$main_mode.zip"

  mkdir -p "$fixture_dir/obsidian-git"
  cat > "$fixture_dir/obsidian-git/manifest.json" <<'JSON'
{
  "name": "Git",
  "description": "Fixture Obsidian Git plugin"
}
JSON
  jq --arg id "$plugin_id" --arg version "$version" '. + {id: $id, version: $version}' \
    "$fixture_dir/obsidian-git/manifest.json" > "$fixture_dir/obsidian-git/manifest.json.tmp"
  mv "$fixture_dir/obsidian-git/manifest.json.tmp" "$fixture_dir/obsidian-git/manifest.json"

  if [ "$main_mode" = "present" ]; then
    printf 'console.log("fixture obsidian git");\n' > "$fixture_dir/obsidian-git/main.js"
  elif [ "$main_mode" = "empty" ]; then
    : > "$fixture_dir/obsidian-git/main.js"
  fi
  printf '.fixture { display: none; }\n' > "$fixture_dir/obsidian-git/styles.css"

  (
    cd "$fixture_dir"
    zip -qr "$zip_path" obsidian-git
  )

  printf '%s' "$zip_path"
}

new_vault() {
  local name="$1"
  local vault="$TMP_DIR/$name"
  mkdir -p "$vault/.obsidian"
  printf '%s' "$vault"
}

cd "$ROOT_DIR"

command -v zip >/dev/null 2>&1 || fail "fixture zip 생성을 위해 zip 명령이 필요하다"

node --check scripts/obsidian-git-setup.mjs >/dev/null
pass "obsidian git setup node 스크립트 문법이 유효하다"

node --check bin/obsidian-git-setup >/dev/null
pass "obsidian git setup plugin bin 명령 문법이 유효하다"

fixture_zip="$(create_fixture_zip)"
wrong_id_zip="$(create_fixture_zip "9.9.9" "not-obsidian-git")"
mismatch_version_zip="$(create_fixture_zip "9.9.8" "obsidian-git")"
empty_main_zip="$(create_fixture_zip "9.9.9" "obsidian-git" "empty")"
export PATH="$ROOT_DIR/bin:$PATH"
export CLAUDE_PLUGIN_ROOT="$ROOT_DIR"

common_json_contract='
  .schema == "oh-my-obsidian/obsidian-git-setup/v1"
  and (.action | type == "string")
  and (.vault.path | type == "string")
  and (.vault.exists | type == "boolean")
  and (.git.available | type == "boolean")
  and (.plugin.id == "obsidian-git")
  and (.status | IN("ready", "needs-user-action", "blocked"))
  and (.issues | type == "array")
'

run_json_test \
  "없는 vault는 blocked 상태를 반환한다" \
  'obsidian-git-setup check "$TMP_DIR/missing-vault"' \
  "$common_json_contract and .status == \"blocked\" and (.issues | index(\"vault path does not exist\"))" \
  1

safe_vault="$(new_vault "vault with spaces")"
run_json_test \
  "safe preset은 플러그인 파일만 설치하고 활성화하지 않는다" \
  'obsidian-git-setup apply "$safe_vault" --preset safe --source-zip "$fixture_zip" --version 9.9.9' \
  "$common_json_contract and .plugin.installed == true and .plugin.installedVersion == \"9.9.9\" and .plugin.enabledInVault == false"

jq -e '
  .autoSaveInterval == 0
  and .autoPullInterval == 0
  and .autoPushInterval == 0
  and .autoPullOnBoot == false
  and .disablePush == true
' "$safe_vault/.obsidian/plugins/obsidian-git/data.json" >/dev/null
pass "safe preset은 자동 commit pull push를 모두 비활성화한다"

if [ -f "$safe_vault/.obsidian/community-plugins.json" ]; then
  fail "safe preset은 community-plugins.json을 쓰면 안 된다"
else
  pass "safe preset은 community plugin 활성화 파일을 쓰지 않는다"
fi

run_json_test \
  "validate는 설치된 plugin 파일 계약을 확인한다" \
  'obsidian-git-setup validate "$safe_vault"' \
  "$common_json_contract and .plugin.installed == true and .plugin.files.main == true and .plugin.files.data == true"

manual_vault="$(new_vault "manual-vault")"
mkdir -p "$manual_vault/.obsidian/plugins/obsidian-git"
printf '["calendar"]\n' > "$manual_vault/.obsidian/community-plugins.json"
printf '{"customKey":true}\n' > "$manual_vault/.obsidian/plugins/obsidian-git/data.json"

run_json_test \
  "manual preset은 명시 enable 때 기존 plugin 목록과 data 키를 보존한다" \
  'obsidian-git-setup apply "$manual_vault" --preset manual --enable --source-zip "$fixture_zip" --version 9.9.9' \
  "$common_json_contract and .plugin.enabledInVault == true"

jq -e 'index("calendar") and index("obsidian-git") and ([.[] | select(. == "obsidian-git")] | length == 1)' \
  "$manual_vault/.obsidian/community-plugins.json" >/dev/null
pass "manual preset은 기존 community plugin 목록을 보존하고 중복 추가하지 않는다"

jq -e '.customKey == true and .autoSaveInterval == 0' \
  "$manual_vault/.obsidian/plugins/obsidian-git/data.json" >/dev/null
pass "manual preset은 기존 data.json 키를 보존한다"

obsidian-git-setup apply "$manual_vault" --preset manual --enable --source-zip "$fixture_zip" --version 9.9.9 >/dev/null
jq -e '([.[] | select(. == "obsidian-git")] | length == 1)' \
  "$manual_vault/.obsidian/community-plugins.json" >/dev/null
pass "manual preset 재실행은 idempotent하다"

state_path="$manual_vault/.oh-my-obsidian/setup-state.json"
jq -e '.obsidianGit.installed == true and .obsidianGit.version == "9.9.9" and .obsidianGit.enabled == true' \
  "$state_path" >/dev/null
pass "apply는 setup-state에 설치 결과를 기록한다"

if find "$manual_vault/.obsidian" -maxdepth 1 -type f \( -name 'app.json' -o -name 'appearance.json' \) | grep -q .; then
  fail "setup은 Restricted Mode 우회를 위한 Obsidian 전역 설정을 쓰면 안 된다"
else
  pass "setup은 Restricted Mode 우회 설정을 쓰지 않는다"
fi

invalid_community_vault="$(new_vault "invalid-community")"
printf '{invalid json\n' > "$invalid_community_vault/.obsidian/community-plugins.json"
if obsidian-git-setup apply "$invalid_community_vault" --preset manual --enable --source-zip "$fixture_zip" --version 9.9.9 >/tmp/oh-my-obsidian-invalid-community.out 2>&1; then
  cat /tmp/oh-my-obsidian-invalid-community.out >&2
  fail "invalid community-plugins.json은 apply를 차단해야 한다"
else
  pass "invalid community-plugins.json은 apply를 차단한다"
fi
grep -q '{invalid json' "$invalid_community_vault/.obsidian/community-plugins.json"
pass "invalid community-plugins.json은 덮어쓰지 않는다"

invalid_data_vault="$(new_vault "invalid-data")"
mkdir -p "$invalid_data_vault/.obsidian/plugins/obsidian-git"
printf '{invalid json\n' > "$invalid_data_vault/.obsidian/plugins/obsidian-git/data.json"
if obsidian-git-setup apply "$invalid_data_vault" --preset safe --source-zip "$fixture_zip" --version 9.9.9 >/tmp/oh-my-obsidian-invalid-data.out 2>&1; then
  cat /tmp/oh-my-obsidian-invalid-data.out >&2
  fail "invalid data.json은 apply를 차단해야 한다"
else
  pass "invalid data.json은 apply를 차단한다"
fi
grep -q '{invalid json' "$invalid_data_vault/.obsidian/plugins/obsidian-git/data.json"
pass "invalid data.json은 덮어쓰지 않는다"

team_sync_vault="$(new_vault "team-sync-vault")"
git -C "$team_sync_vault" -c init.defaultBranch=main init >/dev/null
if obsidian-git-setup apply "$team_sync_vault" --preset team-sync --interval 1 --enable --source-zip "$fixture_zip" --version 9.9.9 >/tmp/oh-my-obsidian-team-sync.out 2>&1; then
  cat /tmp/oh-my-obsidian-team-sync.out >&2
  fail "team-sync는 remote/upstream 없으면 차단해야 한다"
else
  pass "team-sync는 remote/upstream 없으면 차단한다"
fi

if [ -e "$team_sync_vault/.obsidian/plugins/obsidian-git/manifest.json" ]; then
  fail "blocked team-sync는 plugin 파일을 쓰면 안 된다"
else
  pass "blocked team-sync는 plugin 파일을 쓰지 않는다"
fi

team_remote="$(mktemp -d "$TMP_DIR/team-remote.XXXXXX")"
git -C "$team_remote" -c init.defaultBranch=main init --bare >/dev/null
team_success_vault="$(new_vault "team-sync-success")"
git -C "$team_success_vault" -c init.defaultBranch=main init >/dev/null
git -C "$team_success_vault" config user.email "test@example.com"
git -C "$team_success_vault" config user.name "Test User"
printf '# team sync\n' > "$team_success_vault/README.md"
git -C "$team_success_vault" add README.md
git -C "$team_success_vault" commit -m "init" >/dev/null
git -C "$team_success_vault" remote add origin "$team_remote"
git -C "$team_success_vault" push -u origin main >/dev/null 2>&1

run_json_test \
  "team-sync는 remote와 upstream이 있으면 자동 동기화 preset을 적용한다" \
  'obsidian-git-setup apply "$team_success_vault" --preset team-sync --interval 1 --enable --source-zip "$fixture_zip" --version 9.9.9' \
  "$common_json_contract and .plugin.enabledInVault == true and .plugin.installed == true"

jq -e '
  .differentIntervalCommitAndPush == true
  and .autoSaveInterval == 1
  and .autoPullInterval == 1
  and .autoPushInterval == 1
  and .disablePush == false
' "$team_success_vault/.obsidian/plugins/obsidian-git/data.json" >/dev/null
pass "team-sync preset은 명시 interval과 push 활성화를 반영한다"

artifact_vault="$(new_vault "artifact-failure")"
run_json_test \
  "plugin id가 다른 zip은 blocked 상태를 반환한다" \
  'obsidian-git-setup apply "$artifact_vault" --preset safe --source-zip "$wrong_id_zip" --version 9.9.9' \
  '.schema == "oh-my-obsidian/obsidian-git-setup/v1" and .status == "blocked" and (.issues[0] | contains("Unexpected plugin id"))' \
  1

if [ -e "$artifact_vault/.obsidian/plugins/obsidian-git/manifest.json" ]; then
  fail "검증 실패 zip은 plugin 파일을 쓰면 안 된다"
else
  pass "검증 실패 zip은 plugin 파일을 쓰지 않는다"
fi

version_vault="$(new_vault "version-failure")"
run_json_test \
  "version mismatch zip은 blocked 상태를 반환한다" \
  'obsidian-git-setup apply "$version_vault" --preset safe --source-zip "$mismatch_version_zip" --version 9.9.9' \
  '.schema == "oh-my-obsidian/obsidian-git-setup/v1" and .status == "blocked" and (.issues[0] | contains("Plugin version mismatch"))' \
  1

empty_main_vault="$(new_vault "empty-main-failure")"
run_json_test \
  "main.js가 비어 있는 zip은 blocked 상태를 반환한다" \
  'obsidian-git-setup apply "$empty_main_vault" --preset safe --source-zip "$empty_main_zip" --version 9.9.9' \
  '.schema == "oh-my-obsidian/obsidian-git-setup/v1" and .status == "blocked" and (.issues[0] | contains("main.js is missing or empty"))' \
  1
