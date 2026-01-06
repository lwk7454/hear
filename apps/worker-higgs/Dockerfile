FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
# espeak-ng is often required for Coqui TTS
RUN apt-get update && apt-get install -y \
    build-essential \
    libsndfile1 \
    espeak-ng \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install stable dependencies (PyTorch) first with cache mount
# This layer will stay cached even if source code or requirements change
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip && \
    pip install torch==2.5.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cu121

# Copy requirements and install remaining dependencies
COPY requirements.txt .
# We use a cache mount here as well to avoid redownloading common packages
RUN --mount=type=cache,target=/root/.cache/pip \
    grep -v "^-e" requirements.txt > requirements_base.txt && \
    pip install -r requirements_base.txt

# Copy local libraries and install them
COPY lib/ ./lib/
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -e lib/higgs-audio

# Copy source code last
COPY main.py .
COPY src/ ./src/
COPY . .

# Set Env
ENV COQUI_TOS_AGREED=1
ENV PORT=9000

# Expose Port
EXPOSE 9000

# Run
CMD ["python", "-u", "main.py"]
