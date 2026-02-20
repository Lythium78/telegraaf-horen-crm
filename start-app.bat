@echo off
REM Telegraaf Horen CRM - Startup Script
REM Starts the CRM application on port 3001

REM Minimize the terminal window
if not "%WINDOW_MINIMIZED%"=="1" (
  set WINDOW_MINIMIZED=1
  start /min cmd /c "%~f0"
  exit /b
)

echo.
echo ========================================
echo Telegraaf Horen CRM Startup
echo ========================================
echo.

REM Check if we're in the correct directory
if not exist "server.js" (
  echo Error: server.js not found. Please run this script from the crm-project directory.
  pause
  exit /b 1
)

REM Check if node_modules exists, if not install dependencies
if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo Error: npm install failed
    pause
    exit /b 1
  )
)

REM Start the server
echo Starting CRM server on port 3001...
echo.
echo Open your browser and navigate to: http://localhost:3001
echo.
echo Press Ctrl+C to stop the server
echo.

call npm start

pause
