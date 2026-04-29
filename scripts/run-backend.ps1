$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root "services/core"
$venvPython = Join-Path $backend ".venv/Scripts/python.exe"
$bundledPython = Join-Path $env:USERPROFILE ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe"

$python = $null

if (Test-Path $venvPython) {
  $python = $venvPython
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
  $python = "python"
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
  $python = "py"
} elseif (Test-Path $bundledPython) {
  $python = $bundledPython
}

if ($null -eq $python) {
  Write-Host "No encontre Python. Instala Python 3.11+ y marca 'Add python.exe to PATH'."
  exit 1
}

Set-Location $backend

& $python -c "import fastapi, uvicorn" 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Faltan dependencias Python. Ejecuta:"
  Write-Host ".\scripts\setup-backend.ps1"
  exit 1
}

& $python -m uvicorn app.main:app --host 127.0.0.1 --port 8766 --reload
