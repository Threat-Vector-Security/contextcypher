@echo off
echo === PRODUCTION SERVER LAUNCHER ===
echo Starting server in production mode...

set NODE_ENV=production
set FORCE_PRODUCTION=true
set BIND_ALL_INTERFACES=false
set PORT=%1

if "%PORT%"=="" set PORT=3001

echo Environment:
echo   NODE_ENV=%NODE_ENV%
echo   FORCE_PRODUCTION=%FORCE_PRODUCTION%
echo   BIND_ALL_INTERFACES=%BIND_ALL_INTERFACES%
echo   PORT=%PORT%

node force-production.js