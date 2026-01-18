# Provisioner Package

This package provides a self-contained provisioner for setting up the "gold environment" on a RunPod network volume.

## 🚀 Quick Start (GitHub Actions - Automatic)

The provisioner image is **automatically built and pushed** to GitHub Container Registry whenever you push changes to `packages/provisioner/`.

### 1. Push Your Changes

```bash
git add packages/provisioner/
git commit -m "Update provisioner"
git push origin main
```

### 2. Use the Image in RunPod

After GitHub Actions completes (check the Actions tab), use this image:

```
Image: ghcr.io/YOUR_USERNAME/hear/provisioner:latest
```

**RunPod Pod Configuration:**
- **Docker Image**: `ghcr.io/YOUR_USERNAME/hear/provisioner:latest`
- **Volume Mount**: `/runpod-volume` → Your network volume
- **Container Disk**: 10GB (minimal needed)
- **Environment Variables**: None required (all self-contained)

The pod will automatically:
1. Create/update venv at `/runpod-volume/venvs/`
2. Install all dependencies
3. Clone higgs-audio
4. Download models
5. Enter idle mode (stay alive)

---

## 🏗️ Local Testing (Optional)

Test the image locally before pushing:

```bash
cd packages/provisioner
./build-local.sh

# Test with skip mode (no actual downloads)
docker run --rm -e SKIP_HEAVY=1 hear-provisioner:local
```

---

## 📝 What It Does

- **Hash-Based Venv Pruning**: Detects changes to `requirements-volume.txt` and recreates venv to remove stale dependencies
- **Higgs-Audio Installation**: Clones the repo to `/runpod-volume/common-lib/higgs-audio` for shared use
- **Model Downloads**: Downloads Higgs models to `/runpod-volume/models/higgs/` using HuggingFace Hub
- **Idle Mode**: Keeps the pod alive after provisioning via `signal.pause()`

## 🔧 Environment Variables

- `VOLUME_PATH`: Network volume mount point (default: `/runpod-volume`)
- `SKIP_HEAVY`: Set to skip pip install, higgs clone, and model downloads (for testing)

## 📦 Files

- `Dockerfile`: Container definition
- `provision_volume.py`: Main provisioning script
- `requirements-volume.txt`: Gold environment dependencies (source of truth from higgs-story)
- `__init__.py`: Package initialization
- `build-local.sh`: Local build script for testing
- `README.md`: This file

---

## 🔄 GitHub Actions Workflow

The workflow (`.github/workflows/build-provisioner.yml`) triggers on:
- Push to `main` branch (only if `packages/provisioner/**` files changed)
- Manual trigger via workflow dispatch

Built images are tagged as:
- `latest` (on main branch)
- `main-<sha>` (git commit SHA)
- Branch name (for non-main branches)

