#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Prepare Windows-generated videos for orchestrate.py postprocess

.DESCRIPTION
    This script creates a minimal compose config that orchestrate.py can read,
    allowing you to use 'python orchestrate.py postprocess' on Windows-generated data.

.PARAMETER OutputDir
    Output directory containing action JSON files (default: output)

.PARAMETER CameraPrefix
    Camera output directory prefix (default: camera)

.PARAMETER InstanceId
    Instance ID to use for the fake compose config (default: 0)

.EXAMPLE
    .\prepare_for_orchestrate_postprocess.ps1
    python orchestrate.py postprocess --workers 4
#>

param(
    [string]$OutputDir = "output",
    [string]$CameraPrefix = "camera",
    [int]$InstanceId = 0
)

$ErrorActionPreference = "Stop"
$PROJECT_DIR = $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PREPARE FOR ORCHESTRATE POSTPROCESS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Resolve paths
$outputPath = Join-Path $PROJECT_DIR $OutputDir
$cameraPath = Join-Path $PROJECT_DIR $CameraPrefix
$composeDir = Join-Path $PROJECT_DIR "compose_configs"

# Create compose_configs directory
Write-Host "[INFO] Creating compose_configs directory..." -ForegroundColor Cyan
New-Item -ItemType Directory -Path $composeDir -Force | Out-Null

# Get absolute paths for volumes
$outputAbsPath = (Resolve-Path $outputPath).Path
$cameraAlphaAbsPath = (Resolve-Path (Join-Path $cameraPath "output_alpha")).Path
$cameraBravoAbsPath = (Resolve-Path (Join-Path $cameraPath "output_bravo")).Path

# Format instance ID with leading zeros
$instanceIdFormatted = "{0:D3}" -f $InstanceId

# Create a minimal compose file that orchestrate.py can parse
$composeContent = @"
version: '3.8'

services:
  sender_alpha_instance_${InstanceId}:
    image: placeholder
    volumes:
      - ${outputAbsPath}:/output
    environment:
      BOT_NAME: Alpha

  sender_bravo_instance_${InstanceId}:
    image: placeholder
    volumes:
      - ${outputAbsPath}:/output
    environment:
      BOT_NAME: Bravo

  camera_alpha_instance_${InstanceId}:
    image: placeholder
    volumes:
      - ${cameraAlphaAbsPath}:/output
    environment:
      NOVNC_PORT: 6901

  camera_bravo_instance_${InstanceId}:
    image: placeholder
    volumes:
      - ${cameraBravoAbsPath}:/output
    environment:
      NOVNC_PORT: 6902
"@

$composeFile = Join-Path $composeDir "docker-compose-$InstanceId.yml"
$composeContent | Out-File -FilePath $composeFile -Encoding utf8 -Force

Write-Host "[SUCCESS] Created compose config: $composeFile" -ForegroundColor Green
Write-Host ""

# Verify the structure
Write-Host "[INFO] Verifying directory structure..." -ForegroundColor Cyan
Write-Host "  Output dir: $outputAbsPath" -ForegroundColor Gray
Write-Host "  Camera Alpha: $cameraAlphaAbsPath" -ForegroundColor Gray
Write-Host "  Camera Bravo: $cameraBravoAbsPath" -ForegroundColor Gray
Write-Host ""

# Count episodes
$jsonFiles = @(Get-ChildItem -Path $outputPath -Filter "*.json" -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -notmatch "_meta\.json$" -and $_.Name -notmatch "_episode_info\.json$"
})

Write-Host "[INFO] Found $($jsonFiles.Count) episode JSON files" -ForegroundColor Green
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  READY FOR ORCHESTRATE POSTPROCESS!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Run: python orchestrate.py postprocess --workers 4" -ForegroundColor White
Write-Host "  2. Optional: Add --comparison-video for side-by-side videos (slower)" -ForegroundColor White
Write-Host "  3. Optional: Add --output-dir <path> to specify output location" -ForegroundColor White
Write-Host ""
Write-Host "Example:" -ForegroundColor Yellow
Write-Host "  python orchestrate.py postprocess --workers 4 --output-dir output" -ForegroundColor White
Write-Host ""
