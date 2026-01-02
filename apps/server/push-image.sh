#!/bin/bash

# Configuration
IMAGE_NAME="hear/server"
REGISTRY="ghcr.io"

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# Root directory is two levels up from apps/server
ROOT_DIR="$( cd "$SCRIPT_DIR/../.." && pwd )"

cd "$ROOT_DIR" || exit 1

# 1. Load .env variables if present
if [ -f .env ]; then
    echo "🔍 Loading .env..."
    # Source the .env file safely
    export $(grep -v '^#' .env | xargs)
fi

# 2. Load github username from terraform if available
if [ -z "$GITHUB_USERNAME" ]; then
    TF_VARS="terraform/environments/dev/terraform.tfvars"
    if [ -f "$TF_VARS" ]; then
        echo "🔍 Extracting username from Terraform..."
        GITHUB_USERNAME=$(grep "github_username" "$TF_VARS" | cut -d'=' -f2 | tr -d ' "' | xargs)
    fi
fi

# 3. Prompt if still empty
if [ -z "$GITHUB_USERNAME" ]; then
    read -p "Enter your GitHub username: " GITHUB_USERNAME
fi

# 4. Automated Login if GHCR_PAT is present
if [ -n "$GHCR_PAT" ]; then
    echo "🔑 Found GHCR_PAT, attempting automated login for $GITHUB_USERNAME..."
    echo "$GHCR_PAT" | docker login "$REGISTRY" -u "$GITHUB_USERNAME" --password-stdin
fi

FULL_IMAGE_PATH="$REGISTRY/$GITHUB_USERNAME/$IMAGE_NAME:latest"

echo "🚀 Building image: $FULL_IMAGE_PATH (Platform: linux/amd64)"
# Context is ROOT_DIR, Dockerfile is in apps/server
docker build --platform linux/amd64 -t "$FULL_IMAGE_PATH" -f apps/server/Dockerfile .

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo "⬆️ Pushing image to GHCR..."
docker push "$FULL_IMAGE_PATH"

if [ $? -ne 0 ]; then
    echo "❌ Push failed. Make sure you are logged in (docker login ghcr.io)"
    exit 1
fi

echo "✅ Successfully updated $FULL_IMAGE_PATH"
