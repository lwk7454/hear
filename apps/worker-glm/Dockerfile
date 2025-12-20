FROM pytorch/pytorch:2.1.0-cuda12.1-cudnn8-runtime

WORKDIR /workspace

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    ffmpeg \
    libavcodec-extra \
    && rm -rf /var/lib/apt/lists/*

# Install GLM-4-Voice dependencies
RUN pip install --no-cache-dir \
    fastapi \
    uvicorn \
    python-multipart \
    bitsandbytes \
    scipy \
    librosa \
    soundfile \
    transformers \
    accelerate \
    sentencepiece \
    vllm \
    flash-attn --no-build-isolation

# Clone GLM-4-Voice repository
RUN git clone https://github.com/THUDM/GLM-4-Voice.git .

EXPOSE 8003

CMD ["uvicorn", "inference_server:app", "--host", "0.0.0.0", "--port", "8003"]
