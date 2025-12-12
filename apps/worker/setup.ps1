Write-Host "== Hear Worker Setup (Windows) ==" -ForegroundColor Green

# Ensure we are in the script's directory
Set-Location $PSScriptRoot

# 1. Check FFmpeg
Write-Host "Checking FFmpeg..."
if (Get-Command ffmpeg -ErrorAction SilentlyContinue) {
    Write-Host "FFmpeg found" -ForegroundColor Green
} else {
    Write-Host "Error: ffmpeg not found in PATH." -ForegroundColor Red
    Write-Host "Please install FFmpeg and add it to your System PATH."
    Write-Host "  winget install Gyan.FFmpeg"
    exit 1
}

# 2. Check Python (Prefer 3.11 due to Pyannote/Torch compatibility)
Write-Host "Checking Python..."
$PythonCmd = "python"
if (Get-Command py -ErrorAction SilentlyContinue) {
    # Try to check if 3.11 is available (simple check)
    try {
        py -3.11 --version | Out-Null
        $PythonCmd = "py -3.11"
        Write-Host "Found Python 3.11 via py launcher" -ForegroundColor Green
    } catch {
        Write-Host "Python 3.11 not explicitly found via 'py', falling back to default 'python'." -ForegroundColor Yellow
    }
}

# Verify version
try {
    $versionInfo = Invoke-Expression "$PythonCmd --version" 2>&1
    Write-Host "Using: $versionInfo"
} catch {
    Write-Host "Error: Could not determine Python version. Ensure python is installed." -ForegroundColor Red
    exit 1
}

# 3. Create Virtual Environment
if (-not (Test-Path "venv")) {
    Write-Host "Creating virtual environment..."
    Invoke-Expression "$PythonCmd -m venv venv"
    Write-Host "venv created" -ForegroundColor Green
} else {
    Write-Host "venv already exists."
}

# 4. Install Dependencies (Use venv executable directly to bypass execution policy issues during setup)
Write-Host "Installing dependencies..."
$VenvPython = ".\venv\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Host "Error: Virtual environment python not found at $VenvPython" -ForegroundColor Red
    exit 1
}

& $VenvPython -m pip install --upgrade pip

# Install PyTorch with CUDA support (Essential for GPU Worker)
Write-Host "Installing PyTorch (CUDA 12.1)..."
& $VenvPython -m pip install torch==2.2.0 torchaudio==2.2.0 --index-url https://download.pytorch.org/whl/cu121

& $VenvPython -m pip install -r requirements.txt

Write-Host "== Setup Complete ==" -ForegroundColor Green
Write-Host "To start the worker:"
Write-Host "  .\venv\Scripts\Activate"
Write-Host "  python main.py"
