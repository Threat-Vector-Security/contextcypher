# full-rebuild.ps1
# Full rebuild script for ContextCypher Browser-Based development (with bytecode compilation)

Write-Host "ContextCypher - Full Browser-Based Development Rebuild Script" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$localDevAppSecret = 'contextcypher-local-dev-secret'

function Remove-DirectoryRobust {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return $true
    }

    Write-Host "Removing $Path ..." -ForegroundColor Cyan

    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
            Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
        } catch {
            Write-Host "PowerShell remove attempt $attempt failed: $($_.Exception.Message)" -ForegroundColor Yellow
        }

        if (-not (Test-Path -LiteralPath $Path)) {
            Write-Host "Removed $Path" -ForegroundColor Green
            return $true
        }

        cmd /c "if exist `"$Path`" rd /s /q `"$Path`""
        Start-Sleep -Seconds 2

        if (-not (Test-Path -LiteralPath $Path)) {
            Write-Host "Removed $Path (cmd fallback)" -ForegroundColor Green
            return $true
        }
    }

    Write-Host "Failed to remove $Path after multiple attempts." -ForegroundColor Red
    return $false
}

# Step 1: Kill all Node.js and frontend server processes
Write-Host "`nStep 1: Killing all Node.js and server processes..." -ForegroundColor Yellow

# Kill Node.js processes
taskkill /IM node.exe /F 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Node.js processes terminated" -ForegroundColor Green
} else {
    Write-Host "No Node.js processes were running" -ForegroundColor Green
}

# Kill PowerShell windows that have our server titles
Get-Process powershell -ErrorAction SilentlyContinue | Where-Object {
    $_.MainWindowTitle -match "Backend Server|Frontend Server"
} | Stop-Process -Force -ErrorAction SilentlyContinue

# Give processes time to fully terminate
Start-Sleep -Seconds 2

# Step 1b: Clean dependency folders to avoid stale or locked shims
Write-Host "`nStep 1b: Cleaning dependency folders..." -ForegroundColor Yellow
$rootNodeModules = Join-Path $PSScriptRoot "node_modules"
$serverNodeModules = Join-Path $PSScriptRoot "server\node_modules"

$rootRemoved = Remove-DirectoryRobust -Path $rootNodeModules
$serverRemoved = Remove-DirectoryRobust -Path $serverNodeModules

if (-not $rootRemoved -or -not $serverRemoved) {
    Write-Host "Dependency cleanup failed." -ForegroundColor Red
    Write-Host "Close VS Code terminals, OneDrive sync, and any Node processes, then retry." -ForegroundColor Yellow
    exit 1
}

# Step 2: Install dependencies
Write-Host "`nStep 2: Installing dependencies..." -ForegroundColor Yellow

# Install root dependencies
Write-Host "Installing root project dependencies..." -ForegroundColor Cyan
Set-Location $PSScriptRoot
npm install
if ($LASTEXITCODE -eq 0) {
    Write-Host "Root dependencies installed successfully" -ForegroundColor Green
} else {
    Write-Host "Failed to install root dependencies!" -ForegroundColor Red
    exit 1
}

# Install server dependencies
Write-Host "Installing server dependencies..." -ForegroundColor Cyan
$serverPath = Join-Path $PSScriptRoot "server"
Set-Location $serverPath
npm install
if ($LASTEXITCODE -eq 0) {
    Write-Host "Server dependencies installed successfully" -ForegroundColor Green
} else {
    Write-Host "Failed to install server dependencies!" -ForegroundColor Red
    exit 1
}

# Return to root directory
Set-Location $PSScriptRoot

# Step 3: Build frontend (production, obfuscated) and backend bundle (bytenode)
Write-Host "`nStep 3: Building frontend (production + selective obfuscation) and backend (bytecode)..." -ForegroundColor Yellow
npm run build:prod-selective
if ($LASTEXITCODE -eq 0) {
    Write-Host "Frontend+backend build completed successfully (with selective obfuscation)" -ForegroundColor Green
} else {
    Write-Host "Production selective build failed, falling back to standard production build..." -ForegroundColor Yellow
    npm run build:prod
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Frontend+backend build completed (standard production, no obfuscation)" -ForegroundColor Green
    } else {
        Write-Host "Build failed! Check the errors above." -ForegroundColor Red
        exit 1
    }
}

# Step 4: Start the backend server
Write-Host "`nStep 4: Starting backend server..." -ForegroundColor Yellow
$backendPath = Join-Path $PSScriptRoot "server"

# Create a script block with proper environment variables
$backendScript = @"
Set-Location '$backendPath'
`$host.ui.RawUI.WindowTitle = 'Backend Server'
`$env:NODE_ENV = 'development'
`$env:REQUIRE_APP_SECRET = 'false'
`$env:FORCE_PRODUCTION = 'false'
`$env:DEBUG_CORS = 'true'
`$env:PORT = '3002'
`$env:APP_SECRET = '$localDevAppSecret'
Write-Host 'Environment variables set:' -ForegroundColor Cyan
Write-Host "NODE_ENV: `$env:NODE_ENV" -ForegroundColor Yellow
Write-Host "REQUIRE_APP_SECRET: `$env:REQUIRE_APP_SECRET" -ForegroundColor Yellow
Write-Host "FORCE_PRODUCTION: `$env:FORCE_PRODUCTION" -ForegroundColor Yellow
Write-Host "DEBUG_CORS: `$env:DEBUG_CORS" -ForegroundColor Yellow
Write-Host "PORT: `$env:PORT" -ForegroundColor Yellow
Write-Host "APP_SECRET: [SET - local dev profile]" -ForegroundColor Yellow
Write-Host 'Starting backend server...' -ForegroundColor Green
node index.js
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendScript -WindowStyle Normal
Write-Host "Backend server starting on port 3002..." -ForegroundColor Green

# Give backend a moment to start
Write-Host "Waiting for backend server to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Optional quick health check (1 attempt only)
Write-Host "Quick backend health check..." -ForegroundColor Cyan
try {
    $headers = @{
        'Content-Type' = 'application/json'
        'X-App-Secret' = $localDevAppSecret
    }
    
    $response = Invoke-WebRequest -Uri "http://localhost:3002/api/health" -Method GET -Headers $headers -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    
    if ($response.StatusCode -eq 200) {
        Write-Host "Backend server is healthy!" -ForegroundColor Green
    }
} catch {
    Write-Host "Backend still starting up (this is normal)" -ForegroundColor Yellow
    Write-Host "Check the Backend Server window if you encounter connection issues" -ForegroundColor Yellow
}

# Step 5: Start the frontend server
Write-Host "`nStep 5: Starting frontend server..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; `$host.ui.RawUI.WindowTitle = 'Frontend Server'; node scripts/dev-static-server.js" -WindowStyle Normal
Write-Host "Frontend server starting on port 3000..." -ForegroundColor Green

# Final message
Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "Full rebuild complete - Browser-based environment is starting!" -ForegroundColor Green
Write-Host "`nFrontend: http://localhost:3000" -ForegroundColor Cyan
Write-Host "Backend:  http://localhost:3002" -ForegroundColor Cyan
Write-Host "`nNote: Two new PowerShell windows have been opened for the servers." -ForegroundColor Yellow

Write-Host "`nTo stop the servers:" -ForegroundColor Yellow
Write-Host "- Close the PowerShell windows or use Ctrl+C in each" -ForegroundColor Green
Write-Host "`nOpening browser in 3 seconds..." -ForegroundColor Cyan
Start-Sleep -Seconds 3
Start-Process "http://localhost:3000"
