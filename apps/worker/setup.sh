#!/bin/bash

# define colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}== Hear Worker Setup (Mac/Linux) ==${NC}"

# Ensure we are in the script's directory (apps/worker)
cd "$(dirname "$0")" || exit


# 1. Check FFmpeg
echo "Checking FFmpeg..."
if ! command -v ffmpeg &> /dev/null; then
    echo -e "${RED}Error: ffmpeg could not be found.${NC}"
    echo "Please install it."
    echo "  Mac: brew install ffmpeg"
    echo "  Linux: sudo apt install ffmpeg"
    exit 1
fi
echo -e "${GREEN}✓ FFmpeg found${NC}"

# 2. Check Python 3
echo "Checking Python 3..."
PYTHON_CMD="python3"
if command -v python3.11 &> /dev/null; then
    PYTHON_CMD="python3.11"
elif command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
else
    echo "Error: Python 3 not found."
    exit 1
fi

echo "✓ Using $PYTHON_CMD found at $(which $PYTHON_CMD)"

# 3. Create Virtual Env
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    $PYTHON_CMD -m venv venv
    echo "✓ venv created"
else
    echo "venv already exists"
fi

# 4. Install Dependencies
echo "Installing dependencies..."
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo -e "${GREEN}== Setup Complete ==${NC}"
echo "To start the worker:"
echo "  source venv/bin/activate"
echo "  python main.py"
