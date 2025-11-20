#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Post-process video recordings after episodes complete.

.DESCRIPTION
    This script automates the video post-processing workflow:
    1. Processes Alpha camera recordings to extract individual episodes
    2. Processes Bravo camera recordings to extract individual episodes
    3. Runs batch processing to annotate videos and create aligned side-by-side videos

.PARAMETER OutputDir
    Output directory containing action JSON files (default: output)

.PARAMETER CameraPrefix
    Camera output directory prefix (default: camera)

.PARAMETER AnnotationOnly
    Only run annotation, skip alignment

.PARAMETER AlignmentOnly
    Only run alignment, skip annotation

.EXAMPLE
    .\post_process_videos.ps1
    
.EXAMPLE
    .\post_process_videos.ps1 -OutputDir "my_output" -CameraPrefix "my_camera"
    
.EXAMPLE
    .\post_process_videos.ps1 -AnnotationOnly
#>

param(
    [string]$OutputDir = "output",
    [string]$CameraPrefix = "camera",
    [switch]$AnnotationOnly,
    [switch]$AlignmentOnly
)

$ErrorActionPreference = "Stop"
$PROJECT_DIR = Split-Path -Parent $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  VIDEO POST-PROCESSING AUTOMATION" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Resolve paths
$outputPath = Join-Path $PROJECT_DIR $OutputDir
$cameraPath = Join-Path $PROJECT_DIR $CameraPrefix

# Check if output directory exists
if (-not (Test-Path $outputPath)) {
    Write-Host "[ERROR] Output directory not found: $outputPath" -ForegroundColor Red
    Write-Host "Please ensure episodes have been run and action files exist." -ForegroundColor Yellow
    exit 1
}

# Check if camera directories exist
$cameraAlphaPath = Join-Path $cameraPath "output_alpha"
$cameraBravoPath = Join-Path $cameraPath "output_bravo"

if (-not (Test-Path $cameraAlphaPath)) {
    Write-Host "[ERROR] Camera Alpha directory not found: $cameraAlphaPath" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $cameraBravoPath)) {
    Write-Host "[ERROR] Camera Bravo directory not found: $cameraBravoPath" -ForegroundColor Red
    exit 1
}

# Check if camera videos exist
$alphaVideo = Join-Path $cameraAlphaPath "camera_alpha.mp4"
$bravoVideo = Join-Path $cameraBravoPath "camera_bravo.mp4"

if (-not (Test-Path $alphaVideo)) {
    Write-Host "[ERROR] Alpha camera video not found: $alphaVideo" -ForegroundColor Red
    Write-Host "Please ensure camera recordings completed successfully." -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path $bravoVideo)) {
    Write-Host "[ERROR] Bravo camera video not found: $bravoVideo" -ForegroundColor Red
    Write-Host "Please ensure camera recordings completed successfully." -ForegroundColor Yellow
    exit 1
}

Write-Host "[INFO] Found camera recordings:" -ForegroundColor Green
Write-Host "  Alpha: $alphaVideo" -ForegroundColor Gray
Write-Host "  Bravo: $bravoVideo" -ForegroundColor Gray
Write-Host ""

# ============================================
# STEP 1: Process Alpha Recordings
# ============================================
Write-Host "[1/3] Processing Alpha recordings..." -ForegroundColor Cyan

$alphaArgs = @(
    (Join-Path (Join-Path $PROJECT_DIR "postprocess") "process_recordings.py"),
    "--bot", "Alpha",
    "--actions-dir", $outputPath,
    "--camera-prefix", $cameraPath,
    "--output-dir", $outputPath
)

try {
    & python $alphaArgs
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[SUCCESS] Alpha processing completed" -ForegroundColor Green
    } else {
        Write-Host "[ERROR] Alpha processing failed (exit code $LASTEXITCODE)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "[ERROR] Alpha processing encountered error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# ============================================
# STEP 2: Process Bravo Recordings
# ============================================
Write-Host "[2/3] Processing Bravo recordings..." -ForegroundColor Cyan

$bravoArgs = @(
    (Join-Path (Join-Path $PROJECT_DIR "postprocess") "process_recordings.py"),
    "--bot", "Bravo",
    "--actions-dir", $outputPath,
    "--camera-prefix", $cameraPath,
    "--output-dir", $outputPath
)

try {
    & python $bravoArgs
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[SUCCESS] Bravo processing completed" -ForegroundColor Green
    } else {
        Write-Host "[ERROR] Bravo processing failed (exit code $LASTEXITCODE)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "[ERROR] Bravo processing encountered error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# ============================================
# STEP 3: Batch Process (Annotate + Align)
# ============================================
Write-Host "[3/3] Running batch processing (annotation + alignment)..." -ForegroundColor Cyan

$batchArgs = @(
    (Join-Path $PSScriptRoot "batch_process_all.py"),
    "--output-dir", $outputPath
)

if ($AnnotationOnly) {
    $batchArgs += "--annotation-only"
    Write-Host "[INFO] Running annotation only (skipping alignment)" -ForegroundColor Yellow
}

if ($AlignmentOnly) {
    $batchArgs += "--alignment-only"
    Write-Host "[INFO] Running alignment only (skipping annotation)" -ForegroundColor Yellow
}

try {
    & python $batchArgs
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[SUCCESS] Batch processing completed" -ForegroundColor Green
    } else {
        Write-Host "[WARNING] Batch processing had issues (exit code $LASTEXITCODE)" -ForegroundColor Yellow
        Write-Host "Some episodes may have been processed successfully." -ForegroundColor Yellow
    }
} catch {
    Write-Host "[ERROR] Batch processing encountered error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  POST-PROCESSING COMPLETE!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Show output locations
$doneDir = Join-Path $outputPath "done"
$alignedDir = Join-Path $outputPath "aligned-annotated"

Write-Host "Output Locations:" -ForegroundColor Cyan
Write-Host "  Individual episodes: $doneDir" -ForegroundColor Gray
Write-Host "  Side-by-side videos: $alignedDir" -ForegroundColor Gray
Write-Host ""

# Count output files
if (Test-Path $doneDir) {
    $doneVideos = @(Get-ChildItem -Path $doneDir -Filter "*_camera_annotated.mp4" -ErrorAction SilentlyContinue)
    Write-Host "  Annotated videos: $($doneVideos.Count)" -ForegroundColor Gray
}

if (Test-Path $alignedDir) {
    $alignedVideos = @(Get-ChildItem -Path $alignedDir -Filter "*.mp4" -ErrorAction SilentlyContinue)
    Write-Host "  Aligned videos: $($alignedVideos.Count)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
