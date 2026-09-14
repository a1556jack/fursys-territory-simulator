@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_simulator.ps1"
if errorlevel 1 pause
