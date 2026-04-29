$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$desktop = Join-Path $root "apps/desktop"

Set-Location $desktop
npm.cmd run dev

