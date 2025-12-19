@echo off
echo == Hear Worker Setup (Windows) ==

cd /d "%~dp0"

:: 1. Check FFmpeg
where ffmpeg >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: ffmpeg not found in PATH.
    echo Please install FFmpeg and add it to your System PATH.
    echo   winget install Gyan.FFmpeg
    exit /b 1
)
echo FFmpeg found

:: 2. Check Python
:: Try to use py -3.11 if available, otherwise python
set PYTHON_CMD=python
where py >nul 2>nul
if %errorlevel% equ 0 (
    py -3.11 --version >nul 2>nul
    if %errorlevel% equ 0 (
        set PYTHON_CMD=py -3.11
        echo Found Python 3.11 via py launcher
    )
)

%PYTHON_CMD% --version >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Python not found. Please install Python and add to PATH.
    exit /b 1
)
for /f "delims=" %%i in ('%PYTHON_CMD% --version') do echo Using: %%i

:: 3. Create Virtual Environment
if not exist "venv" (
    echo Creating virtual environment...
    %PYTHON_CMD% -m venv venv
    echo venv created
) else (
    echo venv already exists.
)

:: 4. Install Dependencies
echo Installing dependencies...
set VENV_PYTHON=.\venv\Scripts\python.exe

if not exist "%VENV_PYTHON%" (
    echo Error: Virtual environment python not found at %VENV_PYTHON%
    exit /b 1
)

"%VENV_PYTHON%" -m pip install --upgrade pip

:: Install PyTorch with CUDA support
echo Installing PyTorch (CUDA 12.1)...
"%VENV_PYTHON%" -m pip install torch==2.2.0 torchaudio==2.2.0 --index-url https://download.pytorch.org/whl/cu121

"%VENV_PYTHON%" -m pip install -r requirements.txt

echo == Setup Complete ==
echo To start the worker:
echo   venv\Scripts\activate
echo   python main.py
