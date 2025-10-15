#!/usr/bin/env bash
set -euo pipefail

# Configuration
IMAGE_NAME="ojmichel/mc-multiplayer-base"
TAG="latest"
FULL_IMAGE="${IMAGE_NAME}:${TAG}"

echo "============================================"
echo "Building and pushing Docker image"
echo "Image: ${FULL_IMAGE}"
echo "============================================"

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Error: docker command not found. Please install Docker."
    exit 1
fi

# Check if user is logged in to Docker Hub
if ! docker info 2>&1 | grep -q "Username:"; then
    echo "⚠️  Warning: You may not be logged in to Docker Hub."
    echo "If the push fails, run: docker login"
    echo ""
fi

# Build the image
echo "📦 Building Docker image..."
docker build -t "${FULL_IMAGE}" .

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

echo "✅ Build successful!"
echo ""

# Tag the image (in case you want to keep a timestamped version)
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
TIMESTAMPED_TAG="${IMAGE_NAME}:${TIMESTAMP}"
echo "🏷️  Creating timestamped tag: ${TIMESTAMPED_TAG}"
docker tag "${FULL_IMAGE}" "${TIMESTAMPED_TAG}"

# Push the latest tag
echo "📤 Pushing ${FULL_IMAGE} to Docker Hub..."
docker push "${FULL_IMAGE}"

if [ $? -ne 0 ]; then
    echo "❌ Push failed!"
    echo "Make sure you're logged in with: docker login"
    exit 1
fi

echo "✅ Push successful!"
echo ""

# Optionally push the timestamped version (commented out by default)
# Uncomment the lines below if you want to keep timestamped versions on Docker Hub
# echo "📤 Pushing ${TIMESTAMPED_TAG} to Docker Hub..."
# docker push "${TIMESTAMPED_TAG}"

echo "============================================"
echo "✨ Done! Image available at:"
echo "   ${FULL_IMAGE}"
echo ""
echo "Local timestamped tag created:"
echo "   ${TIMESTAMPED_TAG}"
echo "============================================"

