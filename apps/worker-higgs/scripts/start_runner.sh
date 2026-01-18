#!/bin/bash

# Define Venv Path on Volume
VENV_PATH="/runpod-volume/venvs"

# Check if venv exists (basic sanity check)
if [ ! -d "$VENV_PATH" ]; then
    echo "ERROR: Virtual environment not found at $VENV_PATH"
    echo "Did you run the provisioner pod first?"
    exit 1
fi

# Add venv bin to PATH so 'python' refers to the venv python
export PATH="$VENV_PATH/bin:$PATH"

echo "--> Starting Runner with VENV: $(which python)"
# Use -u for unbuffered output to see logs in RunPod console immediately
exec python -u main.py
