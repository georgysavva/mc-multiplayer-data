# Windows Build and Deploy Script for MC Multiplayer Data Collection
# PowerShell version of run_stack.sh specifically for Windows Docker Desktop

param(
    [Parameter(Position=0)]
    [string]$Command = "up",
    
    [switch]$Compare,
    [switch]$Build,
    [switch]$NoCache,
    [switch]$SkipPostProcess,
    [switch]$Align,
    [switch]$ResetWorld,
    [switch]$Help
)

$ErrorActionPreference = "Continue"  # Don't exit on first error
$PROJECT_DIR = $PSScriptRoot
$COMPOSE_FILE = Join-Path $PROJECT_DIR "docker-compose-windows-fixed.yml"
$LOG_DIR = Join-Path $PROJECT_DIR "logs"
$PID_FILE = Join-Path $LOG_DIR ".log_pids.txt"

# Services whose logs we want to capture for later analysis
$LOG_SERVICES = @(
    "prep_data",
    "mc",
    "sender_alpha",
    "sender_bravo",
    "receiver_alpha",
    "receiver_bravo",
    "camera_alpha",
    "camera_bravo",
    "episode_starter"
)

function Show-Usage {
    Write-Host @"
Usage: .\build_and_deploy_windows.ps1 <command> [options]

Commands:
  up [options]      Start the docker stack and begin capturing logs
                    -Compare: Generate side-by-side comparison videos (slower)
                    -Build: Build images instead of pulling them
                    -NoCache: Force Docker to build without cache
                    -SkipPostProcess: Skip aligning and processing recordings
                    -Align: Run alignment after stack shutdown
                    -ResetWorld: Delete data directory before starting (fresh world)
  down              Stop log capture and docker stack
  status            Show container status from docker compose
  logs [service]    Tail saved logs for a service (default: list available logs)
  recordings        List current camera recordings
  
Examples:
  .\build_and_deploy_windows.ps1 up
  .\build_and_deploy_windows.ps1 up -Build -Compare
  .\build_and_deploy_windows.ps1 up -ResetWorld
  .\build_and_deploy_windows.ps1 up -Build -NoCache
  .\build_and_deploy_windows.ps1 down
  .\build_and_deploy_windows.ps1 logs sender_alpha
  .\build_and_deploy_windows.ps1 status
"@
}

function Load-EnvFile {
    $envFile = Join-Path $PROJECT_DIR ".env"
    if (Test-Path $envFile) {
        Write-Host "[run] loading environment from .env" -ForegroundColor Cyan
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^\s*([^#][^=]*)\s*=\s*(.*)$') {
                $name = $matches[1].Trim()
                $value = $matches[2].Trim()
                [Environment]::SetEnvironmentVariable($name, $value, "Process")
            }
        }
    }
}

function Ensure-Requirements {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Host "[run] docker is required but not found in PATH" -ForegroundColor Red
        exit 1
    }
    
    if (-not (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
        Write-Host "[run] docker-compose is required but not found in PATH" -ForegroundColor Red
        Write-Host "[run] Please install Docker Desktop for Windows" -ForegroundColor Yellow
        exit 1
    }
}

function Invoke-ComposeCmd {
    param([Parameter(ValueFromRemainingArguments)]$Arguments)
    & docker-compose -f $COMPOSE_FILE @Arguments
}

function Ensure-Directories {
    $directories = @(
        (Join-Path $PROJECT_DIR "output"),
        (Join-Path $PROJECT_DIR "camera\data_alpha"),
        (Join-Path $PROJECT_DIR "camera\data_bravo"),
        (Join-Path $PROJECT_DIR "camera\output_alpha"),
        (Join-Path $PROJECT_DIR "camera\output_bravo"),
        $LOG_DIR
    )
    
    foreach ($dir in $directories) {
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
    }
}

function Stop-LogCapture {
    if (Test-Path $PID_FILE) {
        Get-Content $PID_FILE | ForEach-Object {
            if ($_ -match '^(\d+):(.+)$') {
                $pid = [int]$matches[1]
                $service = $matches[2]
                try {
                    $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
                    if ($process) {
                        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                    }
                } catch {
                    # Process already stopped
                }
            }
        }
        Remove-Item $PID_FILE -Force -ErrorAction SilentlyContinue
    }
}

function Start-LogCapture {
    New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null
    Stop-LogCapture
    New-Item -ItemType File -Path $PID_FILE -Force | Out-Null
    
    foreach ($service in $LOG_SERVICES) {
        $logfile = Join-Path $LOG_DIR "$service.log"
        
        # Start background job to capture logs
        $job = Start-Job -ScriptBlock {
            param($ComposeFile, $Service, $LogFile)
            & docker-compose -f $ComposeFile logs --no-color --timestamps --follow $Service 2>&1 | Out-File -FilePath $LogFile -Encoding utf8
        } -ArgumentList $COMPOSE_FILE, $service, $logfile
        
        "$($job.Id):$service" | Add-Content -Path $PID_FILE
        Start-Sleep -Milliseconds 200
    }
    
    Write-Host "[run] capturing logs to $LOG_DIR" -ForegroundColor Cyan
}

function Invoke-Up {
    # Ensure we never exit early - always continue to post-processing
    $ErrorActionPreference = "Continue"
    $ProgressPreference = "SilentlyContinue"
    
    Ensure-Directories
    
    # Check for running containers
    $runningIds = Invoke-ComposeCmd ps -q 2>$null
    if ($runningIds) {
        Write-Host "[run] existing stack detected; stopping it before restart" -ForegroundColor Yellow
        Stop-LogCapture
        Invoke-ComposeCmd down
    }
    
    # Handle ResetWorld flag
    if ($ResetWorld) {
        $dataDir = Join-Path $PROJECT_DIR "data"
        if (Test-Path $dataDir) {
            Write-Host "[run] RESET: Deleting existing data directory: $dataDir" -ForegroundColor Yellow
            Remove-Item -Path $dataDir -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "[run] RESET: Data directory deleted" -ForegroundColor Green
        }
    }
    
    # Build or pull images
    if ($Build) {
        Write-Host "[run] building images and starting stack" -ForegroundColor Cyan
        if ($NoCache) {
            Invoke-ComposeCmd build --no-cache
        } else {
            Invoke-ComposeCmd build
        }
    } else {
        Write-Host "[run] pulling images and starting stack" -ForegroundColor Cyan
        Invoke-ComposeCmd pull
    }
    
    # Start stack
    Write-Host "[run] starting containers in background..." -ForegroundColor Cyan
    Invoke-ComposeCmd up -d 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[run] ERROR: Failed to start stack" -ForegroundColor Red
        exit 1
    }
    
    Start-LogCapture
    
    $vncPort1 = $env:CAMERA_ALPHA_NOVNC_PORT
    if (-not $vncPort1) { $vncPort1 = "6901" }
    $vncPort2 = $env:CAMERA_BRAVO_NOVNC_PORT
    if (-not $vncPort2) { $vncPort2 = "6902" }
    $vncPwd = $env:VNC_PASSWORD
    if (-not $vncPwd) { $vncPwd = "research" }
    
    Write-Host "[run] VNC/noVNC alpha: http://localhost:$vncPort1 (pwd: $vncPwd)" -ForegroundColor Cyan
    Write-Host "[run] VNC/noVNC bravo: http://localhost:$vncPort2 (pwd: $vncPwd)" -ForegroundColor Cyan
    Write-Host "[run] waiting for sender services to finish..." -ForegroundColor Yellow
    
    # Wait for sender services to complete
    # Note: We continue to post-processing even if containers exit with non-zero code
    # because episodes may complete successfully even with exit code 1
    $waitSuccess = $true
    try {
        $ErrorActionPreference = "Continue"
        Invoke-ComposeCmd wait sender_alpha sender_bravo 2>&1 | Out-Null
        $waitExitCode = $LASTEXITCODE
        
        if ($waitExitCode -eq 0) {
            Write-Host "[run] senders completed successfully" -ForegroundColor Green
        } else {
            Write-Host "[run] senders exited with code $waitExitCode (may be normal, continuing to post-processing)" -ForegroundColor Yellow
            $waitSuccess = $false
        }
    } catch {
        Write-Host "[run] sender wait encountered error: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "[run] continuing to post-processing anyway..." -ForegroundColor Yellow
        $waitSuccess = $false
    }
    
    Write-Host "[run] shutting down stack..." -ForegroundColor Cyan
    Stop-LogCapture
    
    # Give camera containers time to finalize video recordings
    Write-Host "[run] waiting 10 seconds for cameras to finalize recordings..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
    
    try {
        Invoke-ComposeCmd down 2>&1 | Out-Null
    } catch {
        Write-Host "[run] warning: error during shutdown (continuing)" -ForegroundColor Yellow
    }
    
    # Post-processing
    if ($SkipPostProcess) {
        Write-Host "[run] skipping post-processing per -SkipPostProcess" -ForegroundColor Yellow
    } else {
        Write-Host "[run] aligning camera recordings" -ForegroundColor Cyan
        
        $comparisonFlag = @()
        if ($Compare) {
            $comparisonFlag = @("--comparison-video")
            Write-Host "[run] comparison videos will be generated (slower)" -ForegroundColor Yellow
        }
        
        # Process Alpha
        $alphaArgs = @(
            (Join-Path $PROJECT_DIR "postprocess\process_recordings.py"),
            "--bot", "Alpha",
            "--actions-dir", (Join-Path $PROJECT_DIR "output"),
            "--camera-prefix", (Join-Path $PROJECT_DIR "camera"),
            "--output-dir", (Join-Path $PROJECT_DIR "output")
        ) + $comparisonFlag
        
        Write-Host "[run] processing Alpha recordings..." -ForegroundColor Cyan
        try {
            & python $alphaArgs
            if ($LASTEXITCODE -eq 0) {
                Write-Host "[run] Alpha processing completed successfully" -ForegroundColor Green
            } else {
                Write-Host "[run] WARNING: Alpha processing had issues (exit code $LASTEXITCODE)" -ForegroundColor Yellow
            }
        } catch {
            Write-Host "[run] WARNING: Alpha processing encountered error: $($_.Exception.Message)" -ForegroundColor Yellow
        }
        
        # Process Bravo
        $bravoArgs = @(
            (Join-Path $PROJECT_DIR "postprocess\process_recordings.py"),
            "--bot", "Bravo",
            "--actions-dir", (Join-Path $PROJECT_DIR "output"),
            "--camera-prefix", (Join-Path $PROJECT_DIR "camera"),
            "--output-dir", (Join-Path $PROJECT_DIR "output")
        ) + $comparisonFlag
        
        Write-Host "[run] processing Bravo recordings..." -ForegroundColor Cyan
        try {
            & python $bravoArgs
            if ($LASTEXITCODE -eq 0) {
                Write-Host "[run] Bravo processing completed successfully" -ForegroundColor Green
            } else {
                Write-Host "[run] WARNING: Bravo processing had issues (exit code $LASTEXITCODE)" -ForegroundColor Yellow
            }
        } catch {
            Write-Host "[run] WARNING: Bravo processing encountered error: $($_.Exception.Message)" -ForegroundColor Yellow
        }
        
        # Video alignment if requested
        if ($Align) {
            Write-Host "[run] running video annotation and alignment" -ForegroundColor Cyan
            
            # Find all annotated video pairs in done/ directory
            $doneDir = Join-Path $PROJECT_DIR "output\done"
            $alignedDir = Join-Path $PROJECT_DIR "output\aligned-annotated"
            
            # Ensure aligned directory exists
            New-Item -ItemType Directory -Path $alignedDir -Force | Out-Null
            
            if (Test-Path $doneDir) {
                # Find all annotated Alpha videos
                $alphaAnnotated = Get-ChildItem -Path $doneDir -Filter "*_Alpha_*_camera_annotated.mp4" | Sort-Object Name
                
                $alignmentSuccess = 0
                $alignmentFailed = 0
                
                foreach ($alphaVideo in $alphaAnnotated) {
                    # Extract episode info from filename
                    # Format: YYYYMMDD_HHMMSS_episode_id_Alpha_instance_id_camera_annotated.mp4
                    if ($alphaVideo.Name -match '(\d{8}_\d{6}_\d{6})_Alpha_(instance_\d{3})_camera_annotated\.mp4') {
                        $episodePrefix = $matches[1]
                        $instanceId = $matches[2]
                        
                        # Construct corresponding Bravo video and JSON paths
                        $bravoVideo = Join-Path $doneDir "${episodePrefix}_Bravo_${instanceId}_camera_annotated.mp4"
                        $alphaJson = Join-Path $doneDir "${episodePrefix}_Alpha_${instanceId}.json"
                        $bravoJson = Join-Path $doneDir "${episodePrefix}_Bravo_${instanceId}.json"
                        
                        # Check if all required files exist
                        if ((Test-Path $bravoVideo) -and (Test-Path $alphaJson) -and (Test-Path $bravoJson)) {
                            Write-Host "[run] aligning episode: $episodePrefix" -ForegroundColor Cyan
                            
                            try {
                                $alignArgs = @(
                                    (Join-Path $PROJECT_DIR "video-post-processing-utils\align_videos.py"),
                                    $alphaVideo.FullName,
                                    $alphaJson,
                                    $bravoVideo,
                                    $bravoJson,
                                    $alignedDir
                                )
                                
                                & python $alignArgs
                                
                                if ($LASTEXITCODE -eq 0) {
                                    Write-Host "[run]   aligned episode $episodePrefix" -ForegroundColor Green
                                    $alignmentSuccess++
                                } else {
                                    Write-Host "[run]   alignment failed for episode $episodePrefix (exit code $LASTEXITCODE)" -ForegroundColor Yellow
                                    $alignmentFailed++
                                }
                            } catch {
                                Write-Host "[run]   alignment error for episode $episodePrefix : $($_.Exception.Message)" -ForegroundColor Yellow
                                $alignmentFailed++
                            }
                        } else {
                            Write-Host "[run] skipping episode $episodePrefix (missing files)" -ForegroundColor Yellow
                            $alignmentFailed++
                        }
                    }
                }
                
                # Summary
                Write-Host "`n[run] alignment summary:" -ForegroundColor Cyan
                Write-Host "[run]   successful: $alignmentSuccess" -ForegroundColor Green
                Write-Host "[run]   failed: $alignmentFailed" -ForegroundColor $(if ($alignmentFailed -gt 0) { "Yellow" } else { "Green" })
                
                if ($alignmentSuccess -gt 0) {
                    Write-Host "[run] aligned videos available in: $alignedDir" -ForegroundColor Cyan
                }
            } else {
                Write-Host "[run] WARNING: done/ directory not found at $doneDir" -ForegroundColor Yellow
            }
        }
        
        Write-Host "[run] post-processing complete (check output above for any warnings)" -ForegroundColor Green
        
        # Show final output locations
        Write-Host "`n========================================" -ForegroundColor Cyan
        Write-Host "VIDEO OUTPUT LOCATIONS:" -ForegroundColor Cyan
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host "  Individual episodes: $(Join-Path $PROJECT_DIR 'output\done')" -ForegroundColor White
        if ($Align) {
            Write-Host "  Side-by-side videos: $(Join-Path $PROJECT_DIR 'output\aligned-annotated')" -ForegroundColor Green
        }
        Write-Host "  Action data (JSON):  $(Join-Path $PROJECT_DIR 'output\done')" -ForegroundColor White
        Write-Host "========================================`n" -ForegroundColor Cyan
    }
}

function Invoke-Down {
    Write-Host "[run] stopping log capture" -ForegroundColor Yellow
    Stop-LogCapture
    Write-Host "[run] stopping stack" -ForegroundColor Yellow
    Invoke-ComposeCmd down
    Write-Host "[run] stack stopped" -ForegroundColor Green
}

function Invoke-Status {
    Invoke-ComposeCmd ps
}

function Invoke-Logs {
    param([string]$Service)
    
    if (-not $Service) {
        Write-Host "[run] available log files:" -ForegroundColor Cyan
        if (Test-Path $LOG_DIR) {
            Get-ChildItem -Path $LOG_DIR -Filter "*.log" | ForEach-Object {
                Write-Host "  $($_.Name)" -ForegroundColor Gray
            }
        } else {
            Write-Host "  (none captured yet)" -ForegroundColor Gray
        }
        Write-Host "[run] use '.\build_and_deploy_windows.ps1 logs <service>' to tail a specific log file" -ForegroundColor Yellow
        return
    }
    
    $logfile = Join-Path $LOG_DIR "$Service.log"
    if (-not (Test-Path $logfile)) {
        Write-Host "[run] log file not found for service '$Service'" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "[run] tailing last 50 lines of $logfile (Ctrl+C to exit)" -ForegroundColor Cyan
    Get-Content -Path $logfile -Tail 50 -Wait
}

function Invoke-Recordings {
    Write-Host "[run] camera recordings:" -ForegroundColor Cyan
    $cameraDir = Join-Path $PROJECT_DIR "camera"
    $recordings = Get-ChildItem -Path $cameraDir -Recurse -Filter "camera_*.mp4" -ErrorAction SilentlyContinue
    if ($recordings) {
        $recordings | ForEach-Object {
            Write-Host "  $($_.FullName)" -ForegroundColor Gray
        }
    } else {
        Write-Host "  (no recordings yet)" -ForegroundColor Gray
    }
}

# Main execution
if ($Help) {
    Show-Usage
    exit 0
}

Load-EnvFile
Ensure-Requirements

switch ($Command.ToLower()) {
    "up" {
        Invoke-Up
    }
    "down" {
        Invoke-Down
    }
    "status" {
        Invoke-Status
    }
    "logs" {
        $service = $args[0]
        Invoke-Logs -Service $service
    }
    "recordings" {
        Invoke-Recordings
    }
    default {
        Write-Host "[run] ERROR: Unknown command '$Command'" -ForegroundColor Red
        Write-Host ""
        Show-Usage
        exit 1
    }
}
