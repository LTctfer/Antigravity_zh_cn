@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   Antigravity 简体中文语言层 - 一键安装
echo ============================================
echo.

set "RESTART_PY="
set "RESTART_PS="

tasklist /FI "IMAGENAME eq Antigravity.exe" /NH 2>nul | find /I "Antigravity.exe" >nul
if not errorlevel 1 (
  echo 检测到 Antigravity 正在运行，Windows 下需先关闭进程才能写入 app.asar。
  choice /c YN /n /m "是否自动关闭 Antigravity，安装完成后再重新打开？[Y=是 / N=取消] "
  if errorlevel 2 (
    echo 已取消。请手动完全退出 Antigravity（含托盘图标）后再运行本脚本。
    pause
    exit /b 1
  )
  set "RESTART_PY=--restart"
  set "RESTART_PS=-Restart"
  echo.
)

python -c "import sys" >nul 2>nul
if errorlevel 1 goto use_ps

echo [1/2] 构建注入包...
python -X utf8 tools\build.py
if errorlevel 1 goto err
echo.
echo [2/2] 写入 Antigravity 并同步外置词库...
python -X utf8 tools\install.py --force %RESTART_PY%
if errorlevel 1 goto err
goto done

:use_ps
echo 未检测到可用的 Python，自动切换为免环境 PowerShell 安装模式...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\install.ps1" -Force %RESTART_PS%
if errorlevel 1 goto err

:done
echo.
echo 安装完成！
if "%RESTART_PY%"=="" (
  choice /c YN /n /m "是否立即启动 Antigravity？[Y=启动 / N=退出] "
  if not errorlevel 2 (
    powershell -NoProfile -ExecutionPolicy Bypass -File "tools\install.ps1" -Launch -Silent
  )
)
echo.
pause
exit /b 0

:err
echo.
echo 执行失败，请检查上面的错误信息。
pause
exit /b 1
