$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root "services/core"
$bundledPython = Join-Path $env:USERPROFILE ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe"

$python = $null
if (Get-Command python -ErrorAction SilentlyContinue) {
  $python = "python"
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
  $python = "py"
} elseif (Test-Path $bundledPython) {
  $python = $bundledPython
}

if ($null -eq $python) {
  Write-Host "No encontre Python. Instala Python 3.11+ desde python.org y vuelve a ejecutar este script."
  exit 1
}

Set-Location $backend

if (-not (Test-Path ".venv/Scripts/python.exe")) {
  & $python -m venv .venv
}

$venvPython = Join-Path $backend ".venv/Scripts/python.exe"

$pipCheck = Start-Process -FilePath $venvPython -ArgumentList "-m", "pip", "--version" -NoNewWindow -PassThru -Wait
if ($pipCheck.ExitCode -ne 0) {
  $venvPath = Resolve-Path ".venv"
  if ($venvPath.Path.StartsWith($backend)) {
    Remove-Item -LiteralPath $venvPath.Path -Recurse -Force
  }
  & $python -m venv .venv
  $venvPython = Join-Path $backend ".venv/Scripts/python.exe"
}

& $venvPython -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) {
  Write-Host "No se pudo actualizar pip."
  exit 1
}

& $venvPython -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) {
  Write-Host "No se pudieron instalar las dependencias Python."
  exit 1
}

Write-Host "Backend listo. Ejecuta .\scripts\run-backend.ps1"
