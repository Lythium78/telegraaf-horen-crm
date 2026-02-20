@echo off
REM Create CRM Shortcut on Desktop
REM Telegraaf Horen

setlocal enabledelayedexpansion

REM Get current directory
set CRM_DIR=%~dp0
set CRM_DIR=%CRM_DIR:~0,-1%

REM Get Desktop path
for /f "tokens=3" %%a in ('reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders" /v Desktop ^| findstr Desktop') do set DESKTOP=%%a

if not defined DESKTOP (
  for /f "tokens=3" %%a in ('reg query "HKCU\Desktop" /v Path 2^>nul ^| findstr Path') do set DESKTOP=%%a
)

if not defined DESKTOP (
  set DESKTOP=%USERPROFILE%\Desktop
)

echo.
echo ========================================
echo Creating CRM Shortcut
echo ========================================
echo.
echo CRM Directory: !CRM_DIR!
echo Desktop Path: !DESKTOP!
echo.

REM Use PowerShell to create shortcut
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$WshShell = New-Object -ComObject WScript.Shell; " ^
  "$shortcut = $WshShell.CreateShortcut('!DESKTOP!\Telegraaf Horen CRM.lnk'); " ^
  "$shortcut.TargetPath = '!CRM_DIR!\start-app.bat'; " ^
  "$shortcut.WorkingDirectory = '!CRM_DIR!'; " ^
  "$shortcut.Description = 'Telegraaf Horen - CRM Systeem (poort 3001)'; " ^
  "$shortcut.WindowStyle = 7; " ^
  "$shortcut.Save(); " ^
  "Write-Host 'Shortcut created: !DESKTOP!\Telegraaf Horen CRM.lnk' -ForegroundColor Green"

echo.
echo ✓ Shortcut created successfully!
echo.
pause
