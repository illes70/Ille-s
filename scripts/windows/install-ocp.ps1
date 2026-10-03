# OCP – egyszeri telepítés Windowsra (helyi futtatás a saját gépen).
# Futtatás: jobb klikk → "Run with PowerShell", vagy: powershell -ExecutionPolicy Bypass -File install-ocp.ps1
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Hianyzik a Node.js (22 vagy ujabb). Toltsd le: https://nodejs.org (LTS), telepitsd, majd futtasd ujra ezt." -ForegroundColor Yellow
  Start-Process "https://nodejs.org/en/download"
  exit 1
}
if (-not (Test-Path ".env.local")) {
  Copy-Item ".env.example" ".env.local"
  Write-Host "Letrehoztam a .env.local fajlt – ird bele legalabb az ANTHROPIC_API_KEY-t (Jegyzettomb nyilik)." -ForegroundColor Yellow
  Start-Process notepad ".env.local" -Wait
}

Write-Host "Csomagok telepitese..." ; npm ci
Write-Host "Forditas (1-2 perc)..." ; npm run build

$Desktop = [Environment]::GetFolderPath("Desktop")
$Shell = New-Object -ComObject WScript.Shell
foreach ($n in @("OCP START", "OCP STOP")) {
  $lnk = $Shell.CreateShortcut((Join-Path $Desktop "$n.lnk"))
  $lnk.TargetPath = Join-Path $Root ("scripts\windows\" + ($n -replace " ", "-") + ".cmd")
  $lnk.WorkingDirectory = $Root
  $lnk.Save()
}
Write-Host "KESZ. Asztalon: 'OCP START' inditja, 'OCP STOP' leallitja." -ForegroundColor Green
