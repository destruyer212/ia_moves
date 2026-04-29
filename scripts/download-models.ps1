$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$models = Join-Path $root "services/core/models"
$handModel = Join-Path $models "hand_landmarker.task"

New-Item -ItemType Directory -Force $models | Out-Null

if (-not (Test-Path $handModel)) {
  curl.exe -L "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task" -o $handModel
}

Write-Host "Modelos listos."
