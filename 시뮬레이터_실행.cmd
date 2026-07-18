@echo off
cd /d "%~dp0"
echo.
echo FURSYS Territory Simulator is starting.
echo Open http://127.0.0.1:4317 in your browser.
echo Keep this window open while using the simulator.
echo.
node server.mjs
echo.
echo Server stopped. Press any key to close this window.
pause > nul
