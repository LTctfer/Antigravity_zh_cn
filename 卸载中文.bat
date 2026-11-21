@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   Antigravity 简体中文语言层 - 卸载
echo ============================================
echo.
python -X utf8 tools\install.py --restore
if errorlevel 1 goto err
echo.
echo 已还原英文原版，重启 Antigravity 生效。
pause
exit /b 0

:err
echo.
echo 还原失败：请先完全退出 Antigravity 再试。
pause
exit /b 1
