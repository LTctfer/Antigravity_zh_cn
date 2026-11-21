@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   Antigravity 简体中文语言层 - 安装
echo ============================================
echo.
echo [1/2] 构建注入包...
python -X utf8 tools\build.py
if errorlevel 1 goto err
echo.
echo [2/2] 写入 Antigravity...
python -X utf8 tools\install.py --force
if errorlevel 1 goto err
echo.
echo 安装完成。请完全退出 Antigravity（含托盘图标）后重新打开。
pause
exit /b 0

:err
echo.
echo 执行失败，请检查上面的错误信息。
pause
exit /b 1
