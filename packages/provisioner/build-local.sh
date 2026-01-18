#!/bin/bash
set -e

# Build and test provisioner image locally before pushing

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="hear-provisioner:local"

echo "Building provisioner image..."
docker build -t "$IMAGE_NAME" "$SCRIPT_DIR"

echo ""
echo "✅ Build successful!"
echo ""
echo "To test locally:"
echo "  docker run --rm -e SKIP_HEAVY=1 $IMAGE_NAME"
echo ""
echo "To test with volume:"
echo "  docker run --rm -v /path/to/volume:/runpod-volume $IMAGE_NAME"
echo ""
echo "The GitHub Action will automatically build and push to GHCR when you push changes."
