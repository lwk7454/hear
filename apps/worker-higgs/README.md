# Worker Higgs

This worker handles Text-to-Speech (TTS) generation using the **Higgs Audio V2** model (3B parameters). It is optimized for low-latency audio generation and supports **Instant Voice Cloning** via cached audio embeddings.

## Features
- **FastAPI** based REST API.
- **Higgs Audio V2** integration for high-quality multimodal (text/audio) generation.
- **Cached Audio Injection**: Allows using pre-computed audio tokens (`.pt` files) to clone a voice instantly without re-processing long reference files.
- **8-bit Quantization**: Uses `bitsandbytes` to run the 3B model on consumer GPUs (e.g., RTX 4070 with 12GB VRAM).
- **KV Cache Management**: Optimized memory usage with configurable cache sizes.

## API Endpoints
- `POST /synthesize`: Generates audio from text using a specific Creator ID (voice).
- `POST /clone`: (Legacy/Internal) Used for initial voice processing.

## Setup (Windows)
1. Run `setup.bat` to create a virtual environment and install dependencies (including CUDA-optimized PyTorch).
2. Configure `.env` with your Supabase credentials.
3. Start the worker with `start.bat` or `python main.py`.

## Technical Details
- **Model**: Higgs-Audio-V2-3B
- **Quantization**: 8-bit (via `bitsandbytes`)
- **Device**: CUDA (Recommended)
- **Memory**: ~8-10GB VRAM required for 8-bit mode.

## Troubleshooting
- **Shape Mismatch**: Fixed an issue where injecting cached audio led to tensor size mismatches during generation.
- **CUDA OOM**: Ensure `KV_CACHE_SIZE` in `src/config.py` is appropriate for your GPU VRAM.
