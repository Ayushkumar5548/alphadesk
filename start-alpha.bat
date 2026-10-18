@echo off
rem AlphaDesk: double-click to start (server + public internet tunnel).
rem To stop: start-alpha.bat stop
if /i "%~1"=="stop" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-alpha.ps1" -Stop
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-alpha.ps1"
)
pause
