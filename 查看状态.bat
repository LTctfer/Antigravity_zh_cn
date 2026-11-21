@echo off
chcp 65001 >nul
cd /d "%~dp0"

python -c "import sys" >nul 2>nul
if errorlevel 1 goto use_ps

python -X utf8 tools\install.py --status
goto end

:use_ps
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\install.ps1" -Status

:end
echo.
pause
