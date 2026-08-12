@echo off
rem ============================================
rem  Qian-An-Ji (Qian An Ji) - one-click launcher
rem  Double-click this file to start the server.
rem ============================================
cd /d %~dp0

rem Auto-install dependencies on first run
if not exist node_modules (
  echo [1/2] Installing dependencies, please wait...
  call npm install
)

echo [2/2] Starting server...
echo.
echo   Frontend : http://localhost:3000
echo   Admin    : http://localhost:3000/admin/login.html
echo   Admin account: admin / admin123
echo.
echo   Press Ctrl+C in this window to stop the server.
echo.
node server.js

pause
