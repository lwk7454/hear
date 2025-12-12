# Hear GPU Worker (Python)

This service handles heavy AI audio processing (Demucs, Diarization, Cloning).
It is designed to run on a machine with a dedicated GPU (e.g., Windows with NVIDIA RTX, or Linux Server).

## Setup (Windows/Linux/Mac)

### 1. Prerequisites
- Python 3.11 (Highly Recommended for Pyannote/Torch compatibility)
- NVIDIA Driver (if using CUDA)
- FFmpeg (Must be in PATH)

### 2. Setup

**Mac/Linux:**
```bash
# Installs FFmpeg, Python deps, creates venv
./setup.sh
```

**Windows (PowerShell):**
```powershell
.\setup.ps1
```

### 3. Running
**Mac/Linux:**
```bash
source venv/bin/activate
python main.py
```

**Windows:**
```powershell
.\venv\Scripts\Activate
python main.py
```


### 5. Config
Ensure your `apps/server/.env` has:
```
WORKER_URL=http://<YOUR_WORKER_IP>:8001
```
