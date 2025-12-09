FROM pytorch/pytorch:2.2.0-cuda12.1-cudnn8-runtime

WORKDIR /app

# Install system dependencies for audio (PortAudio/ALSA often needed for audio libs)
RUN apt-get update && apt-get install -y \
    git \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Install Moshi (from git as it's bleeding edge)
RUN pip install git+https://github.com/kyutai-labs/moshi.git

# Expose the port Moshi's internal server uses (usually 8998 or similar)
EXPOSE 8998

# Entrypoint script placeholder
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

CMD ["/app/start.sh"]
