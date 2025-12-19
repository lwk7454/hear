@echo off
echo Starting Higgs Worker (Port 8002)...
cd /d "%~dp0"

:: Activate venv
call venv\Scripts\activate

:: Set Environment
:: Set Environment
set HIGGS_PORT=8002
:: Cache models locally in the project folder for better management
:: if not exist "models" mkdir "models"
:: set HF_HOME=%~dp0models

:: Run
python main.py

pause
