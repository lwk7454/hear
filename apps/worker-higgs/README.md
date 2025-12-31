# Worker Higgs

This worker handles Text-to-Speech (TTS) generation using the **Higgs Audio V2** model (3B parameters). It is optimized for low-latency audio generation and supports **Instant Voice Cloning** via cached audio embeddings.

## Features
- **FastAPI** based REST API.
- **Higgs Audio V2** integration for high-quality multimodal (text/audio) generation.
- **Cached Audio Injection**: Allows using pre-computed audio tokens (`.pt` files) to clone a voice instantly without re-processing long reference files.
- **Full-Sequence Decoding**: Refactored decoding logic to process the entire generated sequence at once, eliminating audio artifacts and improving voice quality.
- **8-bit Quantization**: Uses `bitsandbytes` to run the 3B model on consumer GPUs (e.g., RTX 4070 with 12GB VRAM).
- **KV Cache Management**: Optimized memory usage with configurable cache sizes.

## API Endpoints
- `POST /synthesize`: Generates audio from text using a specific Creator ID (voice).
- `POST /clone`: (Legacy/Internal) Used for initial voice processing.

## Setup (Local)
1. Run `setup.bat` (Windows) or `./setup.sh` (Linux) to create a virtual environment and install dependencies.
2. Configure `.env` with your Supabase credentials.
3. Start the worker with `python main.py`.

## Cloud Deployment (Global Stack)
The worker is deployed as a **RunPod Serverless Endpoint** with a persistent **RunPod Network Volume** for model storage.

### Infrastructure via Terraform
1. Navigate to `terraform/environments/dev/` or `prod/`.
2. Create your local secret files:
   ```bash
   cp terraform.tfvars-example terraform.tfvars
   cp backend.tfvars-example backend.tfvars
   ```
3. Fill in the required API keys and the database password in both files.
4. Initialize the remote state:
   ```bash
   terraform init -backend-config=backend.tfvars
   ```
5. Plan and Apply:
   ```bash
   terraform plan
   terraform apply
   ```

### Key Components
- **RunPod**: GPU compute and serverless scaling.
- **Supabase**: Backend database and file storage for voice embeddings.
- **GHCR**: Docker images are hosted on GitHub Container Registry.

### Docker Build & Push
Before deploying via Terraform, you must build and push the worker image to GHCR:

1.  **Login to GHCR**:
    ```bash
    export CR_PAT=YOUR_GITHUB_TOKEN
    echo $CR_PAT | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
    ```
2.  **Build and Push**:
    ```bash
### Quick Update Script
For local development, use the provided `publish.sh` script (or pnpm command) to build and push in one command:
```bash
# Via script directly
chmod +x publish.sh
./publish.sh

# Or via pnpm/npm
pnpm publish
```
This script automatically pulls your `github_username` from the dev terraform variables.

## Technical Details
- **Model**: Higgs-Audio-V2-3B
- **Quantization**: 8-bit (via `bitsandbytes`)
- **Device**: CUDA (Recommended)
- **Memory**: ~8-10GB VRAM required for 8-bit mode.
- **Platform**: RunPod Serverless (Linux-based)

## Troubleshooting
- **Audio Artifacts**: Resolved by switching from chunked decoding to full-sequence decoding.
- **Shape Mismatch**: Fixed an issue where injecting cached audio led to tensor size mismatches during generation.
- **CUDA OOM**: Ensure `KV_CACHE_SIZE` in `src/config.py` is appropriate for your GPU VRAM.
