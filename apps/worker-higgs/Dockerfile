# Slim base image matching higgs-story
FROM python:3.11-slim

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install system dependencies (matching higgs-story)
# ffmpeg and libsndfile1 are required for audio processing
# git is required to clone the higgs-audio library onto the volume
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    git \
    nano \
    && rm -rf /var/lib/apt/lists/*

# Add current directory to PYTHONPATH
ENV PYTHONPATH="/app"

# Copy requirements files
COPY requirements.txt ./

# Install minimal dependencies in the image (runpod, requests, supabase)
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Make scripts executable
RUN chmod +x /app/scripts/*.sh

# Set Env
ENV COQUI_TOS_AGREED=1
ENV PORT=9000

# Expose Port
EXPOSE 9000

# Run via start_runner.sh (assumes volume is provisioned)
CMD [ "/app/scripts/start_runner.sh" ]
