@echo off
REM Development-Rebuild.bat
REM Automated rebuild script for AI Threat Modeler development

echo AI Threat Modeler - Development Rebuild Script
echo =============================================

REM Step 1: Kill all Node.js processes
echo.
echo Step 1: Killing all Node.js processes...
taskkill /IM node.exe /F >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Node.js processes terminated
) else (
    echo [OK] No Node.js processes were running
)

REM Give processes time to fully terminate
timeout /t 2 /nobreak >nul

REM Step 2: Build the frontend
echo.
echo Step 2: Building frontend...
cd /d "%~dp0"
call npm run build
if %errorlevel% equ 0 (
    echo [OK] Frontend build completed successfully
) else (
    echo [ERROR] Frontend build failed! Check the errors above.
    pause
    exit /b 1
)

REM Step 3: Start the backend server
echo.
echo Step 3: Starting backend server...
start "Backend Server" cmd /k "cd /d %~dp0server && set NODE_ENV=development&& set REQUIRE_APP_SECRET=false&& set FORCE_PRODUCTION=false&& set DEBUG_CORS=true&& set APP_SECRET=contextcypher-local-dev-secret&& set LOCAL_DEV_APP_SECRET=contextcypher-local-dev-secret&& echo Environment variables set: && echo NODE_ENV=%NODE_ENV% && echo REQUIRE_APP_SECRET=%REQUIRE_APP_SECRET% && echo DEBUG_CORS=%DEBUG_CORS% && echo APP_SECRET=[SET - local dev profile] && echo Starting backend server... && node index.js"
echo [OK] Backend server starting on port 3002...

REM Give backend more time to start
timeout /t 5 /nobreak >nul

REM Verify backend is running
echo.
echo Verifying backend server health...
curl -s -o nul -w "Backend health check: %%{http_code}\n" -H "Content-Type: application/json" -H "X-App-Secret: contextcypher-local-dev-secret" http://localhost:3002/api/health 2>nul
if %errorlevel% equ 0 (
    echo [OK] Backend server is healthy
) else (
    echo [WARNING] Backend server may not be ready. Check the Backend Server window for errors.
)

REM Step 4: Start the frontend server
echo.
echo Step 4: Starting frontend server...
start "Frontend Server" cmd /k "cd /d %~dp0 && http-server build -a 127.0.0.1 -p 3000 -c-1"
echo [OK] Frontend server starting on port 3000...

REM Final message
echo.
echo =============================================
echo Development environment is starting!
echo.
echo Frontend: http://localhost:3000
echo Backend:  http://localhost:3002
echo.
echo Note: Two new command windows have been opened for the servers.
echo To stop the servers, close those windows or use Ctrl+C in each.
echo.
pause
