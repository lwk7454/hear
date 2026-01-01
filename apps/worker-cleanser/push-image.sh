#!/bin/bash

# Configuration
REGISTRY="ghcr.io"
GITHUB_USER="lwk7454" # Adjust if needed
IMAGE_NAME="worker-cleanser"
TAG="latest"

IMAGE_URL="$REGISTRY/$GITHUB_USER/$IMAGE_NAME:$TAG"

echo "== Building $IMAGE_NAME =="

# Build the image
docker build -t $IMAGE_NAME .

# Tag for GHCR
docker tag $IMAGE_NAME $IMAGE_URL

echo "== Pushing to GHCR =="

# Push to GHCR
docker push $IMAGE_URL

echo "== Done: $IMAGE_URL =="
