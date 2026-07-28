@echo off
setlocal
cd /d "%~dp0"

set "SIMULATOR_URL=http://127.0.0.1:4317/"
set "NODE_EXE="

for /f "delims=" %%I in ('where node.exe 2^>nul') do (
  if not defined NODE_EXE set "NODE_EXE=%%I"
)

if not defined NODE_EXE (
  set "CODEX_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  if exist "%CODEX_NODE%" set "NODE_EXE=%CODEX_NODE%"
)

if not defined NODE_EXE (
  echo.
  echo [ERROR] Node.js could not be found.
  echo Install Node.js or run the simulator from Codex.
  echo.
  pause
  exit /b 1
)

call :check_server
if not errorlevel 1 goto open_simulator

echo.
echo FURSYS Territory Simulator server is starting.
start "FURSYS Territory Simulator Server" /min "%NODE_EXE%" "%~dp0server.mjs"

for /l %%I in (1,1,15) do (
  timeout /t 1 /nobreak >nul
  call :check_server
  if not errorlevel 1 goto open_simulator
)

echo.
echo [ERROR] The server did not start.
echo Check the minimized server window for details.
echo.
pause
exit /b 1

:open_simulator
echo.
echo Simulator ready: %SIMULATOR_URL%
if /I not "%SIMULATOR_NO_BROWSER%"=="1" start "" "%SIMULATOR_URL%"
timeout /t 2 /nobreak >nul
exit /b 0

:check_server
powershell.exe -NoProfile -Command "try { $response = Invoke-WebRequest -UseBasicParsing '%SIMULATOR_URL%' -TimeoutSec 2; if ($response.StatusCode -eq 200) { exit 0 } } catch {}; exit 1" >nul 2>nul
exit /b %errorlevel%
