@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   创建桌面“Antigravity (中文版)”无感启动器
echo ============================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\create_shortcut.ps1"
if errorlevel 1 goto err
echo.
echo 创建成功！以后从桌面“Antigravity (中文版)”打开，官方升级后会自动静默重注汉化。
pause
exit /b 0

:err
echo.
echo 创建失败，请检查上面的错误信息。
pause
exit /b 1
