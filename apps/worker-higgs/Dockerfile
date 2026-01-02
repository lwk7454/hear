FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
# espeak-ng is often required for Coqui TTS
RUN apt-get update && apt-get install -y \
    build-essential \
    libsndfile1 \
    espeak-ng \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy Requirements and local libraries for installation
COPY requirements.txt .
COPY lib/ ./lib/

# Install Dependencies
# Use CUDA 12.1 index for production Linux GPU environment
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cu121 && \
    pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Set Env
ENV COQUI_TOS_AGREED=1
ENV PORT=9000

# Expose Port
EXPOSE 9000

# Run
CMD ["python", "-u", "main.py"]
