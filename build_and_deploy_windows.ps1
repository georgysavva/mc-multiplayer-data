# Windows Build and Deploy Script for MC Multiplayer Data Collection
# PowerShell version of build_and_push.sh specifically for Windows Docker Desktop

param(
    [string]$ImageName = "ojmichel/mc-multiplayer-base",
    [string]$Tag = "latest",
    [switch]$Push,
    [switch]$NoCache,
    [switch]$Help,
    [switch]$ResetWorld
)

if ($Help) {
    Write-Host "Windows Build and Deploy Script for MC Multiplayer Data Collection"
    Write-Host ""
    Write-Host "Usage: .\build_and_deploy_windows.ps1 [OPTIONS]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -ImageName <name>    Docker image name (default: ojmichel/mc-multiplayer-base)"
    Write-Host "  -Tag <tag>           Image tag (default: latest)"
    Write-Host "  -Push                Push to Docker Hub (default: no push)"
    Write-Host "  -NoCache             Build without using Docker cache"
    Write-Host "  -ResetWorld          Reset the Minecraft world by deleting the local 'data53' directory before deploy"
    Write-Host "  -Help                Show this help message"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\build_and_deploy_windows.ps1                                    # Build and deploy locally only"
    Write-Host "  .\build_and_deploy_windows.ps1 -NoCache                          # Build without cache, no push"
    Write-Host "  .\build_and_deploy_windows.ps1 -ResetWorld                       # Reset world (delete .\data53) then build & deploy"
    Write-Host "  .\build_and_deploy_windows.ps1 -Push                             # Build, push to Docker Hub, and deploy"
    Write-Host "  .\build_and_deploy_windows.ps1 -ImageName myname/mc-data -Tag dev -Push # Custom image with push"
    exit 0
}

$FullImage = "${ImageName}:${Tag}"
$ComposeFile = "docker-compose-windows-fixed.yml"
$DockerFile = "Dockerfile.windows"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "[BUILD] MC Multiplayer Data - Windows Build & Deploy" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[CONFIG] Configuration:"
Write-Host "   Image: $FullImage"
Write-Host "   Dockerfile: $DockerFile"
Write-Host "   Compose File: $ComposeFile"
Write-Host "   No Cache: $NoCache"
Write-Host "   Push: $Push"
Write-Host "   Reset World: $ResetWorld"
Write-Host ""

# Check if required files exist
if (-not (Test-Path $DockerFile)) {
    Write-Host "[ERROR] Dockerfile not found: $DockerFile" -ForegroundColor Red
    Write-Host "Make sure you're in the correct directory!" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $ComposeFile)) {
    Write-Host "[ERROR] Compose file not found: $ComposeFile" -ForegroundColor Red
    Write-Host "Make sure you're in the correct directory!" -ForegroundColor Red
    exit 1
}

# Stop existing containers
Write-Host "[STOP] Stopping existing containers..." -ForegroundColor Yellow
docker-compose -f $ComposeFile down -v --remove-orphans
if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARN] Warning: Failed to stop containers (might be okay if none were running)" -ForegroundColor Yellow
}

# Create required directories
Write-Host "[SETUP] Creating required directories..." -ForegroundColor Cyan
$directories = @(
    "data53",
    "output", 
    "camera\data_alpha",
    "camera\data_bravo", 
    "camera\output_alpha",
    "camera\output_bravo"
)

foreach ($dir in $directories) {
    # If requested, remove the existing world directory before recreating
    if ($ResetWorld -and (Split-Path -Leaf $dir) -eq "data53" -and (Test-Path $dir)) {
        Write-Host "   [RESET] Deleting existing: $dir" -ForegroundColor Yellow
        try {
            Remove-Item -Path $dir -Recurse -Force
            Write-Host "   [OK] Deleted: $dir" -ForegroundColor Green
        } catch {
            Write-Host "[ERROR] Failed to delete '$dir': $($_.Exception.Message)" -ForegroundColor Red
            exit 1
        }
    }

    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "   [OK] Created: $dir" -ForegroundColor Green
    } else {
        Write-Host "   [OK] Exists: $dir" -ForegroundColor Green
    }
}

# Build Docker image
Write-Host ""
Write-Host "[BUILD] Building Docker image..." -ForegroundColor Cyan
$buildArgs = @("build", "-f", $DockerFile, "-t", $FullImage)

if ($NoCache) {
    $buildArgs += "--no-cache"
    Write-Host "   Using --no-cache flag" -ForegroundColor Yellow
}

$buildArgs += "."

Write-Host "   Command: docker $($buildArgs -join ' ')" -ForegroundColor Gray
& docker $buildArgs

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "[SUCCESS] Build successful!" -ForegroundColor Green

# Create timestamped tag
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$timestampedTag = "${ImageName}:${timestamp}"
Write-Host ""
Write-Host "[TAG] Creating timestamped tag: $timestampedTag" -ForegroundColor Cyan
docker tag $FullImage $timestampedTag

# Push to Docker Hub (unless --Push is not specified)
if ($Push) {
    Write-Host ""
    Write-Host "[PUSH] Pushing $FullImage to Docker Hub..." -ForegroundColor Cyan
    docker push $FullImage
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Push failed!" -ForegroundColor Red
        Write-Host "Make sure you're logged in with: docker login" -ForegroundColor Yellow
        exit 1
    }
    
    Write-Host "[SUCCESS] Push successful!" -ForegroundColor Green
} else {
    Write-Host "[SKIP] Skipping push to Docker Hub (-Push not specified)" -ForegroundColor Yellow
}

# Deploy containers
Write-Host ""
Write-Host "[DEPLOY] Starting containers with Windows configuration..." -ForegroundColor Cyan
docker-compose -f $ComposeFile up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Deployment failed!" -ForegroundColor Red
    exit 1
}

Write-Host "[SUCCESS] Containers started successfully!" -ForegroundColor Green

# Show container status
Write-Host ""
Write-Host "[STATUS] Container Status:" -ForegroundColor Cyan
docker-compose -f $ComposeFile ps

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "[COMPLETE] Deployment Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[ACCESS] Access Points:" -ForegroundColor Cyan
Write-Host "   Camera Alpha VNC:  http://localhost:6901 (password: research)"
Write-Host "   Camera Bravo VNC:  http://localhost:6902 (password: research)"
Write-Host "   Minecraft Server:  localhost:25565"
Write-Host ""
Write-Host "[OUTPUT] Output Locations:" -ForegroundColor Cyan
Write-Host "   Bot Data:     .\output\"
Write-Host "   Camera Alpha: .\camera\output_alpha\"
Write-Host "   Camera Bravo: .\camera\output_bravo\"
Write-Host ""
Write-Host "[COMMANDS] Useful Commands:" -ForegroundColor Cyan
Write-Host "   Monitor logs:     docker-compose -f $ComposeFile logs -f"
Write-Host "   Check status:     docker-compose -f $ComposeFile ps"
Write-Host "   Stop all:         docker-compose -f $ComposeFile down -v"
Write-Host "   View sender logs: docker-compose -f $ComposeFile logs sender_alpha sender_bravo"
Write-Host ""
Write-Host "[DONE] Happy data collecting!" -ForegroundColor Green
