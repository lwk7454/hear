@echo off
echo == Hear Higgs Worker Setup (Windows) ==

cd /d "%~dp0"

:: 1. Check Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Python not found. Please install Python 3.10+ and add to PATH.
    pause
    exit /b 1
)

:: 2. Create Venv
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
) else (
    echo venv already exists.
)

:: 3. Activate
call venv\Scripts\activate

:: 4. Install Torch with CUDA (Critical for RTX 4070)
:: Using stable url for cu118 or cu121. RTX 40 series supports CUDA 12.
echo Installing PyTorch (CUDA 12.1)...
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121

:: 5. Install Other Deps
echo Installing other dependencies...
pip install -r requirements.txt

:: 6. Auto-accept Coqui License (sometimes needed)
set COQUI_TOS_AGREED=1

echo.
echo == Setup Complete ==
echo To start: start.bat
