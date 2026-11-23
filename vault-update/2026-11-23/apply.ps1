# Badbounce vault update 2026-11-23 (overview test videos + engine fixes + sheets + launcher 1.13.24)
# Copies everything in .\files into the vault. Old versions are kept, never deleted:
#   old Final files  -> Archive\Old finals (2026-11-23)\<same path>
#   other old files  -> Trash\<same path>
param([string]$Vault = "$env:USERPROFILE\OneDrive\Badbounce")
$ErrorActionPreference = 'Stop'
$Src = Join-Path $PSScriptRoot 'files'
if (-not (Test-Path $Vault)) { Write-Host "Vault not found: $Vault" -ForegroundColor Red; Read-Host 'Press Enter'; exit 1 }
$log = @(); $n = 0
Get-ChildItem -Path $Src -Recurse -File -Force | ForEach-Object {
  $rel = $_.FullName.Substring($Src.Length + 1)
  $dst = Join-Path $Vault $rel
  if (Test-Path -LiteralPath $dst) {
    if ($rel -like '.claude-workspace\*') { }
    elseif ($rel -like 'Konzepte\*\Final\*') { $bak = Join-Path $Vault (Join-Path 'Archive\Old finals (2026-11-23)' $rel) }
    else { $bak = Join-Path $Vault (Join-Path 'Trash' $rel) }
    if ($bak) { New-Item -ItemType Directory -Force -Path (Split-Path $bak) | Out-Null; Copy-Item -LiteralPath $dst -Destination $bak -Force; $log += "kept old: $rel -> $bak" }
    $bak = $null
  }
  New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
  Copy-Item -LiteralPath $_.FullName -Destination $dst -Force
  $log += "new: $rel"; $n++
}
$logDir = Join-Path $Vault 'Claude\Vault logs\2026-11-23 overview tests'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log | Set-Content -Encoding UTF8 (Join-Path $logDir 'apply log.txt')
Write-Host "Done: $n files copied into $Vault" -ForegroundColor Green
Write-Host "Log: $logDir\apply log.txt"
Write-Host "Launcher 1.13.24 is ready: open the launcher and press the update button (or restart it)."
Read-Host 'Press Enter to close'
