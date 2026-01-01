FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libsndfile1 \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy Requirements
COPY requirements.txt .

# Install Dependencies
# Use CUDA 12.1 index for production Linux GPU environment
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cu121 && \
    pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Set Env
ENV PORT=8001

# Expose Port
EXPOSE 8001

# Run
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
