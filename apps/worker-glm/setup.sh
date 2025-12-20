#!/bin/bash

# Setup script for GLM-4-Voice on RunPod
# Runs on Ubuntu with CUDA 12.1

echo "Setting up GLM-4-Voice environment..."

apt-get update && apt-get install -y ffmpeg

pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install fastapi uvicorn bitsandbytes transformers accelerate peft flash-attn
pip install git+https://github.com/huggingface/transformers.git

echo "Infrastructure ready for GLM-4-Voice."
