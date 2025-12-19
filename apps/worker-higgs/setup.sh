#!/bin/bash

# define colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}== Hear Higgs Worker Setup (Linux/Mac) ==${NC}"

# Ensure we are in the script's directory
cd "$(dirname "$0")" || exit

# 1. Check Python
PYTHON_CMD="python3"
if command -v python3.11 &> /dev/null; then
    PYTHON_CMD="python3.11"
elif command -v python3.10 &> /dev/null; then
    PYTHON_CMD="python3.10"
elif command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
else
    echo "Error: Python 3 not found."
    exit 1
fi

echo "✓ Using $PYTHON_CMD found at $(which $PYTHON_CMD)"

# 2. Create Virtual Env
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    $PYTHON_CMD -m venv venv
    echo "✓ venv created"
else
    echo "venv already exists"
fi

# 3. Activate
source venv/bin/activate

# 4. Install Dependencies
echo "Installing dependencies..."
pip install --upgrade pip

# For Linux (CUDA 12.1), we typically want the nvidia index
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
  echo "Detected Linux. Installing Torch with CUDA 12.1 support..."
  pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
else
  # Mac (MPS) or other
  echo "Detected Non-Linux. Installing standard Torch..."
  pip install torch torchaudio
fi

pip install -r requirements.txt

# 5. Agree to Coqui TOS
export COQUI_TOS_AGREED=1

echo -e "${GREEN}== Setup Complete ==${NC}"
echo "To start the worker:"
echo "  source venv/bin/activate"
echo "  python main.py"
