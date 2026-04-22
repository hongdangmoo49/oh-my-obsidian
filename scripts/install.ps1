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
    $VaultPath = Read-Host "볼트 경로를 입력하세요 (기본: $HOME\Documents\Obsidian\vault)"
    if (-not $VaultPath) {
        $VaultPath = "$HOME\Documents\Obsidian\vault"
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
[Environment]::SetEnvironmentVariable("OBSIDIAN_VAULT", $VaultPath, "User")
$env:OBSIDIAN_VAULT = $VaultPath
Write-Success "  OBSIDIAN_VAULT = $VaultPath ✓"

# ── Create Vault Structure ──
Write-Info "`n📂 볼트 구조 생성..."
# 작업기록 레이어 (mandatory)
$workRecords = @("작업기록\세션기록", "작업기록\의사결정", "작업기록\트러블슈팅", "작업기록\회의록")
foreach ($cat in $workRecords) {
    $catPath = Join-Path $VaultPath $cat
    if (-not (Test-Path $catPath)) {
        New-Item -ItemType Directory -Path $catPath -Force | Out-Null
    }
}
Write-Success "  작업기록 레이어 생성 ✓"
# scripts 레이어 (mandatory)
$scriptsDir = Join-Path $VaultPath "scripts\team-setup"
if (-not (Test-Path $scriptsDir)) {
    New-Item -ItemType Directory -Path $scriptsDir -Force | Out-Null
}
Write-Success "  scripts 레이어 생성 ✓"

# ── Done ──
Write-Success "`n✅ oh-my-obsidian 설치 완료!`n"
Write-Info "검증:"
Write-Host "  1. 터미널 새로 열기 (환경변수 반영)"
Write-Host "  2. Claude Code 완전 종료 후 재시작"
Write-Host "  3. 새 세션에서 테스트: `"이전 작업 회상해줘`"`n"
