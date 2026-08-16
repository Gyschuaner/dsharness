@echo off
rem One-click restart of dsh web (127.0.0.1:3080)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0restart-dsh-web.ps1" %*
echo.
pause
