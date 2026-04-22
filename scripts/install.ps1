# oh-my-obsidian — Windows Install Script
# Run: powershell -ExecutionPolicy Bypass -File .\install.ps1

param(
    [string]$VaultPath = ""
)

$ErrorActionPreference = "Stop"

# ── Colors ──
function Write-Info($msg) { Write-Host $msg -ForegroundColor Cyan }
function Write-Success($msg) { Write-Host $msg -ForegroundColor Green }
function Write-Warn($msg) { Write-Host $msg -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host $msg -ForegroundColor Red }

# ── Header ──
Write-Info "`n🔧 oh-my-obsidian 설치 스크립트`n"

# ── Prerequisites ──
Write-Info "📋 사전 요구사항 확인..."

# Check Node.js
$nodeVersion = $null
try {
    $nodeVersion = (node --version 2>$null)
} catch {}

if (-not $nodeVersion -or $nodeVersion -notmatch "^v(\d+)") {
    Write-Err "❌ Node.js 18+ 이 필요합니다. https://nodejs.org 에서 설치하세요."
    exit 1
}
$nodeMajor = [int]$Matches[1]
if ($nodeMajor -lt 18) {
    Write-Err "❌ Node.js 18+ 필요 (현재: $nodeVersion)"
    exit 1
}
Write-Success "  Node.js: $nodeVersion ✓"

# Check git
try {
    $gitVersion = (git --version 2>$null)
    Write-Success "  $gitVersion ✓"
} catch {
    Write-Err "❌ git 이 필요합니다."
    exit 1
}

# ── Vault Path ──
if (-not $VaultPath) {
    $VaultPath = Read-Host "볼트 경로를 입력하세요 (기본: $HOME\Documents\Obsidian\llm-store)"
    if (-not $VaultPath) {
        $VaultPath = "$HOME\Documents\Obsidian\llm-store"
    }
}

$VaultPath = [System.IO.Path]::GetFullPath($VaultPath)
Write-Info "`n📂 볼트 경로: $VaultPath"

# Create vault directory if needed
if (-not (Test-Path $VaultPath)) {
    New-Item -ItemType Directory -Path $VaultPath -Force | Out-Null
    Write-Success "  볼트 디렉토리 생성 완료"
}

# ── Set Environment Variable ──
Write-Info "`n🔧 환경변수 설정..."
[Environment]::SetEnvironmentVariable("TOOLDI_VAULT", $VaultPath, "User")
$env:TOOLDI_VAULT = $VaultPath
Write-Success "  TOOLDI_VAULT = $VaultPath ✓"

# ── Configure MCP for Claude Code ──
Write-Info "`n🔧 Claude Code MCP 설정..."
$mcpPath = "$HOME\.claude\mcp.json"

# Backup existing config
if (Test-Path $mcpPath) {
    $backupPath = "$mcpPath.$(Get-Date -Format 'yyyyMMdd-HHmmss').bak"
    Copy-Item $mcpPath $backupPath
    Write-Warn "  기존 설정 백업: $backupPath"
    $mcpConfig = Get-Content $mcpPath -Raw | ConvertFrom-Json
} else {
    $mcpConfig = @{}
}

# Add llm-store-recall server
$mcpJson = @{
    "llm-store-recall" = @{
        "type" = "sse"
        "url" = "https://mcp.tooldi.com/sse"
    }
}

# Merge into existing config
$existingMcp = Get-Content $mcpPath -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json -ErrorAction SilentlyContinue
if ($existingMcp) {
    # Check if already configured
    if ($existingMcp.'llm-store-recall') {
        Write-Warn "  llm-store-recall 이미 설정됨 — 업데이트"
    }
    $existingMcp | Add-Member -NotePropertyName 'llm-store-recall' -NotePropertyValue $mcpJson.'llm-store-recall' -Force
    $existingMcp | ConvertTo-Json -Depth 10 | Set-Content $mcpPath -Encoding UTF8
} else {
    $mcpJson | ConvertTo-Json -Depth 10 | Set-Content $mcpPath -Encoding UTF8
}
Write-Success "  MCP 서버 설정 완료 ✓"

# ── Configure Claude Desktop ──
$desktopConfigPath = "$env:APPDATA\Claude\claude_desktop_config.json"
if (Test-Path $desktopConfigPath) {
    Write-Info "`n🔧 Claude Desktop MCP 설정..."
    $backupPath = "$desktopConfigPath.$(Get-Date -Format 'yyyyMMdd-HHmmss').bak"
    Copy-Item $desktopConfigPath $backupPath

    $desktopConfig = Get-Content $desktopConfigPath -Raw | ConvertFrom-Json
    if (-not $desktopConfig.mcpServers) {
        $desktopConfig | Add-Member -NotePropertyName 'mcpServers' -NotePropertyValue @{} -Force
    }
    $desktopConfig.mcpServers | Add-Member -NotePropertyName 'llm-store-recall' -NotePropertyValue @{
        "type" = "sse"
        "url" = "https://mcp.tooldi.com/sse"
    } -Force
    $desktopConfig | ConvertTo-Json -Depth 10 | Set-Content $desktopConfigPath -Encoding UTF8
    Write-Success "  Claude Desktop 설정 완료 ✓"
} else {
    Write-Warn "  Claude Desktop 설정 파일 없음 — 건너뜀"
}

# ── Validate MCP Connectivity ──
Write-Info "`n🔍 MCP 서버 연결 확인..."
try {
    $response = curl.exe -N --max-time 3 -s -o NUL -w "%{http_code}" https://mcp.tooldi.com/sse 2>$null
    if ($response -eq "200") {
        Write-Success "  MCP 서버 연결 성공 ✓"
    } else {
        Write-Warn "  MCP 서버 응답: $response (설정은 완료됨, 네트워크 상태 확인 필요)"
    }
} catch {
    Write-Warn "  MCP 서버 연결 확인 실패 (설정은 완료됨, 나중에 다시 확인)"
}

# ── Create Vault Structure ──
Write-Info "`n📂 볼트 구조 생성..."
$categories = @("작업기록", "의사결정", "트러블슈팅", "회의록", "외부자료", "가이드")
foreach ($cat in $categories) {
    $catPath = Join-Path $VaultPath $cat
    if (-not (Test-Path $catPath)) {
        New-Item -ItemType Directory -Path $catPath -Force | Out-Null
    }
}
Write-Success "  $($categories.Count)개 카테고리 폴더 생성 ✓"

# ── Done ──
Write-Success "`n✅ oh-my-obsidian 설치 완료!`n"
Write-Info "검증:"
Write-Host "  1. 터미널 새로 열기 (환경변수 반영)"
Write-Host "  2. Claude Code 완전 종료 후 재시작"
Write-Host "  3. claude mcp list → 'llm-store-recall ✓ Connected' 확인"
Write-Host "  4. 새 세션에서 테스트: `"editor schema 회상해줘`"`n"
