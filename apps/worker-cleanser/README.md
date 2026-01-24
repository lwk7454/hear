# Worker Cleanser

This worker handles audio pre-processing tasks including **Source Separation** (Demucs) and **Speaker Diarization** (Pyannote). It is essential for the ingestion pipeline to isolate clean vocals from YouTube videos.

## Features
- **FastAPI** based REST API.
- **Demucs (htdemucs)**: Separates vocals from background music/noise.
- **Pyannote Audio**: Performs speaker diarization to identify who is speaking when.
- **GPU Accelerated**: Optimized for CUDA execution.

## API Endpoints
- `POST /cleanse`: Upload audio/video URL or file → Returns isolated vocal track.
- `POST /diarize`: Upload audio → Returns speaker segments (timestamps).

## Setup (Local)
1. Run `setup.sh` (Linux/Mac) or `setup.bat` (Windows) to create a virtual environment and install dependencies.
   *   *Note: Requires `ffmpeg` installed on the system.*
2. Start the worker:
   ```bash
   source venv/bin/activate
   python main.py
   ```
   Server runs on `http://0.0.0.0:8001`.

## Cloud Deployment
The worker is deployd as a **RunPod Serverless Endpoint**.

### Infrastructure via Terraform
Each worker manages its own infrastructure to allow independent scaling.

1. Navigate to `terraform/environments/dev/` or `prod/`.
2. Configure your `terraform.tfvars`:
   ```hcl
   runpod_api_key   = "your-key"
   github_username  = "your-user"
   environment      = "dev"
   ```
3. Deploy:
   ```bash
   terraform init
   terraform apply
   ```

### Docker Build & Push
Images are hosted on GitHub Container Registry (GHCR).

1.  **Login**:
    ```bash
    echo $CR_PAT | docker login ghcr.io -u USERNAME --password-stdin
    ```
2.  **Build & Push**:
    ```bash
    # Use the helper script
    ./push-image.sh
    ```

## Technical Details
- **Base Image**: `python:3.11-slim`
- **GPU Requirement**: >= 8GB VRAM recommended.
- **Models**:
    - `htdemucs` (Downloaded to local cache on first run)
    - `pyannote/speaker-diarization-3.1` (Requires HuggingFace Auth Token in env if not cached)
