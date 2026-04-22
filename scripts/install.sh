#!/usr/bin/env bash
# oh-my-obsidian — Mac/Linux Install Script
# Run: bash install.sh [vault-path]

set -euo pipefail

VAULT_PATH="${1:-}"

# ── Colors ──
info()  { echo -e "\033[36m$1\033[0m"; }
ok()    { echo -e "\033[32m$1\033[0m"; }
warn()  { echo -e "\033[33m$1\033[0m"; }
err()   { echo -e "\033[31m$1\033[0m"; }

# ── Header ──
info "\n🔧 oh-my-obsidian 설치 스크립트\n"

# ── Prerequisites ──
info "📋 사전 요구사항 확인..."

# Check git
if ! command -v git &>/dev/null; then
    err "❌ git 이 필요합니다."
    exit 1
fi
ok "  $(git --version) ✓"

# ── Vault Path ──
if [ -z "$VAULT_PATH" ]; then
    read -rp "볼트 경로를 입력하세요 (기본: ~/Documents/Obsidian/vault): " VAULT_PATH
    VAULT_PATH="${VAULT_PATH:-$HOME/Documents/Obsidian/vault}"
fi
VAULT_PATH="$(cd "$(dirname "$VAULT_PATH")" 2>/dev/null && pwd)/$(basename "$VAULT_PATH")" 2>/dev/null || VAULT_PATH="$HOME/Documents/Obsidian/vault"

info "\n📂 볼트 경로: $VAULT_PATH"

# Create vault directory
mkdir -p "$VAULT_PATH"
ok "  볼트 디렉토리 준비 완료"

# ── Set Environment Variable ──
info "\n🔧 환경변수 설정..."
export OBSIDIAN_VAULT="$VAULT_PATH"

# Determine shell profile
SHELL_RC=""
if [ -n "${ZSH_VERSION:-}" ] || [ "${SHELL:-}" = */zsh ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -n "${BASH_VERSION:-}" ] || [ "${SHELL:-}" = */bash ]; then
    SHELL_RC="$HOME/.bashrc"
fi

if [ -n "$SHELL_RC" ]; then
    # Remove old export if exists, then add new one
    if grep -q "export OBSIDIAN_VAULT=" "$SHELL_RC" 2>/dev/null; then
        sed -i.bak "s|export OBSIDIAN_VAULT=.*|export OBSIDIAN_VAULT=\"$VAULT_PATH\"|" "$SHELL_RC"
        warn "  기존 환경변수 업데이트"
    else
        echo "" >> "$SHELL_RC"
        echo "# oh-my-obsidian vault path" >> "$SHELL_RC"
        echo "export OBSIDIAN_VAULT=\"$VAULT_PATH\"" >> "$SHELL_RC"
    fi
    ok "  OBSIDIAN_VAULT = $VAULT_PATH ✓ ($SHELL_RC)"
else
    warn "  쉘 프로필을 자동 감지하지 못함. 수동으로 추가하세요:"
    echo "    export OBSIDIAN_VAULT=\"$VAULT_PATH\""
fi

# ── Create Vault Structure ──
info "\n📂 볼트 구조 생성..."
CATEGORIES=("작업기록" "의사결정" "트러블슈팅" "회의록" "외부자료" "가이드")
for cat in "${CATEGORIES[@]}"; do
    mkdir -p "$VAULT_PATH/$cat"
done
ok "  ${#CATEGORIES[@]}개 카테고리 폴더 생성 ✓"

# ── Done ──
ok "\n✅ oh-my-obsidian 설치 완료!\n"
info "검증:"
echo "  1. 터미널 새로 열기 (환경변수 반영)"
echo "  2. Claude Code 완전 종료 후 재시작"
echo "  3. 새 세션에서 테스트: \"이전 작업 회상해줘\"\n"
