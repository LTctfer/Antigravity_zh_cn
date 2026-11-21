@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   Antigravity 简体中文语言层 - 词库热更新
echo ============================================
echo.

python -c "import sys" >nul 2>nul
if errorlevel 1 goto use_ps

if exist "src\kernel.js" (
  echo [1/2] 重新构建词典包...
  python -X utf8 tools\build.py
  if errorlevel 1 goto err
  echo.
  echo [2/2] 同步到外置词库...
  python -X utf8 tools\install.py --update-dict
  if errorlevel 1 goto err
  goto ok
)

:use_ps
echo 正在从 GitHub 拉取最新词库（若仅离线同步本地 build 包，请加本地路径）...
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\install.ps1" -UpdateDict -Online
if errorlevel 1 goto err

:ok
echo.
echo 更新成功！无需重启 Antigravity，回到窗口按 Alt+Shift+R 即可立即生效。
pause
exit /b 0

:err
echo.
echo 更新失败，请检查上面的错误信息。
pause
exit /b 1
