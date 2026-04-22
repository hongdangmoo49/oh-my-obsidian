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

# Check Node.js
if ! command -v node &>/dev/null; then
    err "❌ Node.js 18+ 이 필요합니다. https://nodejs.org 에서 설치하세요."
    exit 1
fi
NODE_VERSION=$(node --version)
NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/^v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 18 ]; then
    err "❌ Node.js 18+ 필요 (현재: $NODE_VERSION)"
    exit 1
fi
ok "  Node.js: $NODE_VERSION ✓"

# Check git
if ! command -v git &>/dev/null; then
    err "❌ git 이 필요합니다."
    exit 1
fi
ok "  $(git --version) ✓"

# Check jq
if ! command -v jq &>/dev/null; then
    warn "  ⚠ jq 권장 (brew install jq / apt install jq)"
fi

# ── Vault Path ──
if [ -z "$VAULT_PATH" ]; then
    read -rp "볼트 경로를 입력하세요 (기본: ~/Documents/Obsidian/llm-store): " VAULT_PATH
    VAULT_PATH="${VAULT_PATH:-$HOME/Documents/Obsidian/llm-store}"
fi
VAULT_PATH="$(cd "$(dirname "$VAULT_PATH")" 2>/dev/null && pwd)/$(basename "$VAULT_PATH")" 2>/dev/null || VAULT_PATH="$HOME/Documents/Obsidian/llm-store"

info "\n📂 볼트 경로: $VAULT_PATH"

# Create vault directory
mkdir -p "$VAULT_PATH"
ok "  볼트 디렉토리 준비 완료"

# ── Set Environment Variable ──
info "\n🔧 환경변수 설정..."
export TOOLDI_VAULT="$VAULT_PATH"

# Determine shell profile
SHELL_RC=""
if [ -n "${ZSH_VERSION:-}" ] || [ "${SHELL:-}" = */zsh ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -n "${BASH_VERSION:-}" ] || [ "${SHELL:-}" = */bash ]; then
    SHELL_RC="$HOME/.bashrc"
fi

if [ -n "$SHELL_RC" ]; then
    # Remove old export if exists, then add new one
    if grep -q "export TOOLDI_VAULT=" "$SHELL_RC" 2>/dev/null; then
        sed -i.bak "s|export TOOLDI_VAULT=.*|export TOOLDI_VAULT=\"$VAULT_PATH\"|" "$SHELL_RC"
        warn "  기존 환경변수 업데이트"
    else
        echo "" >> "$SHELL_RC"
        echo "# oh-my-obsidian vault path" >> "$SHELL_RC"
        echo "export TOOLDI_VAULT=\"$VAULT_PATH\"" >> "$SHELL_RC"
    fi
    ok "  TOOLDI_VAULT = $VAULT_PATH ✓ ($SHELL_RC)"
else
    warn "  쉘 프로필을 자동 감지하지 못함. 수동으로 추가하세요:"
    echo "    export TOOLDI_VAULT=\"$VAULT_PATH\""
fi

# ── Configure MCP for Claude Code ──
info "\n🔧 Claude Code MCP 설정..."
MCP_FILE="$HOME/.claude/mcp.json"
mkdir -p "$HOME/.claude"

# Backup
if [ -f "$MCP_FILE" ]; then
    BACKUP="$MCP_FILE.$(date +%Y%m%d-%H%M%S).bak"
    cp "$MCP_FILE" "$BACKUP"
    warn "  기존 설정 백업: $BACKUP"
fi

# Merge MCP config
if command -v jq &>/dev/null && [ -f "$MCP_FILE" ]; then
    jq '. + {"llm-store-recall": {"type": "sse", "url": "https://mcp.tooldi.com/sse"}}' \
       "$MCP_FILE" > "$MCP_FILE.tmp" && mv "$MCP_FILE.tmp" "$MCP_FILE"
else
    # Without jq, write directly
    if [ -f "$MCP_FILE" ]; then
        # Simple append approach (may need manual cleanup)
        python3 -c "
import json, sys
with open('$MCP_FILE') as f: cfg = json.load(f)
cfg['llm-store-recall'] = {'type': 'sse', 'url': 'https://mcp.tooldi.com/sse'}
with open('$MCP_FILE', 'w') as f: json.dump(cfg, f, indent=2, ensure_ascii=False)
" 2>/dev/null || warn "  jq/python3 없음 — 수동으로 MCP 설정 필요"
    else
        cat > "$MCP_FILE" << 'MCPEOF'
{
  "llm-store-recall": {
    "type": "sse",
    "url": "https://mcp.tooldi.com/sse"
  }
}
MCPEOF
    fi
fi
ok "  MCP 서버 설정 완료 ✓"

# ── Configure Claude Desktop ──
DESKTOP_CONFIG=""
if [ "$(uname)" = "Darwin" ]; then
    DESKTOP_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
else
    DESKTOP_CONFIG="$HOME/.config/Claude/claude_desktop_config.json"
fi

if [ -f "$DESKTOP_CONFIG" ]; then
    info "\n🔧 Claude Desktop MCP 설정..."
    BACKUP="$DESKTOP_CONFIG.$(date +%Y%m%d-%H%M%S).bak"
    cp "$DESKTOP_CONFIG" "$BACKUP"

    if command -v jq &>/dev/null; then
        jq '.mcpServers += {"llm-store-recall": {"type": "sse", "url": "https://mcp.tooldi.com/sse"}}' \
           "$DESKTOP_CONFIG" > "$DESKTOP_CONFIG.tmp" && mv "$DESKTOP_CONFIG.tmp" "$DESKTOP_CONFIG"
        ok "  Claude Desktop 설정 완료 ✓"
    fi
else
    warn "  Claude Desktop 설정 파일 없음 — 건너뜀"
fi

# ── Validate MCP Connectivity ──
info "\n🔍 MCP 서버 연결 확인..."
HTTP_CODE=$(curl -N --max-time 3 -s -o /dev/null -w "%{http_code}" https://mcp.tooldi.com/sse 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
    ok "  MCP 서버 연결 성공 ✓"
else
    warn "  MCP 서버 응답: $HTTP_CODE (설정은 완료됨, 네트워크 상태 확인 필요)"
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
echo "  3. claude mcp list → 'llm-store-recall ✓ Connected' 확인"
echo "  4. 새 세션에서 테스트: \"editor schema 회상해줘\"\n"
