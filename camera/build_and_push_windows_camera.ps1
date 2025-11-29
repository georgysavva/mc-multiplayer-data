# Configuration
$IMAGE_NAME = "ojmichel/mineflayer-spectator-client"
$TAG = "latest"
$FULL_IMAGE = "${IMAGE_NAME}:${TAG}"

# Get the directory where this script is located
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Building and pushing Camera Docker image" -ForegroundColor Cyan
Write-Host "Image: ${FULL_IMAGE}" -ForegroundColor Cyan
Write-Host "Context: ${SCRIPT_DIR}" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is available
try {
    docker --version | Out-Null
} catch {
    Write-Host "❌ Error: docker command not found. Please install Docker." -ForegroundColor Red
    exit 1
}

# Check if user is logged in to Docker Hub
$dockerInfo = docker info 2>&1 | Out-String
if ($dockerInfo -notmatch "Username:") {
    Write-Host "⚠️  Warning: You may not be logged in to Docker Hub." -ForegroundColor Yellow
    Write-Host "If the push fails, run: docker login" -ForegroundColor Yellow
    Write-Host ""
}

# Build the image using Windows-compatible Dockerfile
Write-Host "📦 Building Camera Docker image..." -ForegroundColor Green
docker build -f "${SCRIPT_DIR}\Dockerfile.windows.camera" -t "${FULL_IMAGE}" "${SCRIPT_DIR}"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Build successful!" -ForegroundColor Green
Write-Host ""

# Tag the image (in case you want to keep a timestamped version)
$TIMESTAMP = Get-Date -Format "yyyyMMdd-HHmmss"
$TIMESTAMPED_TAG = "${IMAGE_NAME}:${TIMESTAMP}"
Write-Host "🏷️  Creating timestamped tag: ${TIMESTAMPED_TAG}" -ForegroundColor Cyan
docker tag "${FULL_IMAGE}" "${TIMESTAMPED_TAG}"

# Push the latest tag
Write-Host "📤 Pushing ${FULL_IMAGE} to Docker Hub..." -ForegroundColor Green
docker push "${FULL_IMAGE}"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Push failed!" -ForegroundColor Red
    Write-Host "Make sure you're logged in with: docker login" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Push successful!" -ForegroundColor Green
Write-Host ""

# Optionally push the timestamped version (commented out by default)
# Uncomment the lines below if you want to keep timestamped versions on Docker Hub
# Write-Host "📤 Pushing ${TIMESTAMPED_TAG} to Docker Hub..." -ForegroundColor Green
# docker push "${TIMESTAMPED_TAG}"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "✨ Done! Image available at:" -ForegroundColor Green
Write-Host "   ${FULL_IMAGE}" -ForegroundColor White
Write-Host ""
Write-Host "Local timestamped tag created:" -ForegroundColor Cyan
Write-Host "   ${TIMESTAMPED_TAG}" -ForegroundColor White
Write-Host "============================================" -ForegroundColor Cyan
