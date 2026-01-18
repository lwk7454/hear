FROM python:3.11-slim

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install system dependencies
# git: required to clone higgs-audio
# nano: useful for debugging
RUN apt-get update && apt-get install -y \
    git \
    nano \
    && rm -rf /var/lib/apt/lists/*

# Copy the entire provisioner package
COPY . /app/provisioner

# Set Python path to include provisioner
ENV PYTHONPATH="/app:${PYTHONPATH}"

# Default command: Run provisioner
# This will provision the volume and then enter idle mode
CMD ["python", "-m", "provisioner.provision_volume"]
