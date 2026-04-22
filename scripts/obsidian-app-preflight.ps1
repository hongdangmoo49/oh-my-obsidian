<#
oh-my-obsidian Obsidian app preflight for native Windows.

This script mirrors scripts/obsidian-app-preflight.sh for Windows hosts.
It is intended to be called by the Claude Code plugin setup flow.
#>

param(
    [ValidateSet("check", "install", "open-vault")]
    [string]$Action = "check",
    [string]$VaultPath = ""
)

$ErrorActionPreference = "Stop"

function Get-CommandPath {
    param([string[]]$Names)

    foreach ($name in $Names) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($cmd) {
            return $cmd.Source
        }
    }

    return ""
}

function Test-ObsidianProtocol {
    return Test-Path "Registry::HKEY_CLASSES_ROOT\obsidian"
}

function Test-WingetObsidian {
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
        return $false
    }

    try {
        winget list --id Obsidian.Obsidian -e --source winget | Out-Null
        return ($LASTEXITCODE -eq 0)
    } catch {
        return $false
    }
}

function Invoke-Check {
    $wingetPath = Get-CommandPath @("winget")
    $cliPath = Get-CommandPath @("obsidian", "Obsidian.com")
    $protocolRegistered = Test-ObsidianProtocol
    $installedByWinget = Test-WingetObsidian
    $installed = [bool]($protocolRegistered -or $installedByWinget -or $cliPath)

    $canAutoInstall = [bool]$wingetPath
    $installCommand = ""
    $installMethod = "manual-exe"

    if ($canAutoInstall) {
        $installMethod = "winget"
        $installCommand = "winget install --id Obsidian.Obsidian -e --source winget --scope user --accept-source-agreements --accept-package-agreements"
    }

    [ordered]@{
        schema = "oh-my-obsidian/obsidian-app-preflight/v1"
        action = "check"
        platform = "windows"
        context = "native"
        obsidian = [ordered]@{
            installed = $installed
            path = ""
            version = ""
        }
        cli = [ordered]@{
            availableOnPath = [bool]$cliPath
            path = $cliPath
            bundledCliAvailable = $false
            bundledCliPath = ""
        }
        packageManagers = [ordered]@{
            winget = [ordered]@{
                available = [bool]$wingetPath
                path = $wingetPath
                packageId = "Obsidian.Obsidian"
            }
        }
        uri = [ordered]@{
            obsidianProtocolRegistered = $protocolRegistered
        }
        recommendation = [ordered]@{
            canAutoInstall = $canAutoInstall
            installMethod = $installMethod
            installCommand = $installCommand
            manualUrl = "https://obsidian.md/download"
        }
    } | ConvertTo-Json -Depth 10
}

function Invoke-Install {
    if (Test-ObsidianProtocol -or Test-WingetObsidian) {
        Write-Host "Obsidian is already installed."
        return
    }

    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw "winget is unavailable. Install Obsidian manually: https://obsidian.md/download"
    }

    winget install --id Obsidian.Obsidian -e --source winget --scope user --accept-source-agreements --accept-package-agreements
}

function Invoke-OpenVault {
    if (-not $VaultPath) {
        throw "Vault path is required for open-vault."
    }

    $resolvedPath = [System.IO.Path]::GetFullPath($VaultPath)
    if (-not (Test-Path $resolvedPath)) {
        throw "Vault path does not exist: $resolvedPath"
    }

    $encodedPath = [uri]::EscapeDataString($resolvedPath)
    Start-Process "obsidian://open?path=$encodedPath"
}

switch ($Action) {
    "check" { Invoke-Check }
    "install" { Invoke-Install }
    "open-vault" { Invoke-OpenVault }
}
