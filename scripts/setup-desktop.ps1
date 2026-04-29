$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$desktop = Join-Path $root "apps/desktop"

Set-Location $desktop
npm.cmd install

Write-Host "Desktop listo. Ejecuta .\scripts\run-desktop.ps1"
