# Development-Rebuild.ps1
# Automated rebuild script for AI Threat Modeler Browser-Based development

Write-Host "ContextCypher - Browser-Based Development Rebuild Script" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan

$localDevAppSecret = 'contextcypher-local-dev-secret'

# Step 1: Kill all Node.js and http-server processes
Write-Host "`nStep 1: Killing all Node.js and server processes..." -ForegroundColor Yellow

# Kill Node.js processes
taskkill /IM node.exe /F 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Node.js processes terminated" -ForegroundColor Green
} else {
    Write-Host "No Node.js processes were running" -ForegroundColor Green
}

# Kill http-server processes
taskkill /IM http-server.cmd /F 2>$null

# Kill PowerShell windows that have our server titles
Get-Process powershell -ErrorAction SilentlyContinue | Where-Object {
    $_.MainWindowTitle -match "Backend Server|Frontend Server"
} | Stop-Process -Force -ErrorAction SilentlyContinue

# Give processes time to fully terminate
Start-Sleep -Seconds 2

# Step 2: Start development servers with hot reload
Write-Host "`nStep 2: Starting development servers with hot reload..." -ForegroundColor Yellow
Set-Location $PSScriptRoot

# Start the backend server with nodemon for hot reload
Write-Host "`nStarting backend server with hot reload..." -ForegroundColor Yellow
$backendPath = Join-Path $PSScriptRoot "server"

$backendScript = @"
Set-Location '$backendPath'
`$host.ui.RawUI.WindowTitle = 'Backend Server'
`$env:NODE_ENV = 'development'
`$env:REQUIRE_APP_SECRET = 'false'
`$env:FORCE_PRODUCTION = 'false'
`$env:DEBUG_CORS = 'true'
`$env:PORT = '3002'
`$env:APP_SECRET = '$localDevAppSecret'
Write-Host 'Backend Environment Variables:' -ForegroundColor Cyan
Write-Host "NODE_ENV: `$env:NODE_ENV" -ForegroundColor Yellow
Write-Host "REQUIRE_APP_SECRET: `$env:REQUIRE_APP_SECRET" -ForegroundColor Yellow
Write-Host "DEBUG_CORS: `$env:DEBUG_CORS" -ForegroundColor Yellow
Write-Host "PORT: `$env:PORT" -ForegroundColor Yellow
Write-Host "APP_SECRET: [SET - local dev profile]" -ForegroundColor Yellow
Write-Host 'Starting backend with nodemon...' -ForegroundColor Green
npm run dev
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendScript -WindowStyle Normal
Write-Host "Backend server starting on port 3002 with hot reload..." -ForegroundColor Green

# Give backend time to start
Start-Sleep -Seconds 5

# Start the frontend with React hot reload
Write-Host "`nStarting frontend server with hot reload..." -ForegroundColor Yellow

$frontendScript = @"
Set-Location '$PSScriptRoot'
`$host.ui.RawUI.WindowTitle = 'Frontend Server'
`$env:REACT_APP_LOCAL_DEV_SECRET = '$localDevAppSecret'
`$env:REACT_APP_SECRET = '$localDevAppSecret'
`$env:BROWSER = 'none'
Write-Host 'Frontend Environment Variables:' -ForegroundColor Cyan
Write-Host "REACT_APP_LOCAL_DEV_SECRET: [SET]" -ForegroundColor Yellow
Write-Host "REACT_APP_SECRET: [SET - legacy compatibility]" -ForegroundColor Yellow
Write-Host 'Starting React dev server...' -ForegroundColor Green
npm start
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendScript -WindowStyle Normal
Write-Host "Frontend server starting on port 3000 with hot reload..." -ForegroundColor Green

# Final message
Write-Host "`n=======================================================" -ForegroundColor Cyan
Write-Host "Browser-based development environment is starting!" -ForegroundColor Green
Write-Host "`nFrontend: http://localhost:3000" -ForegroundColor Cyan
Write-Host "Backend:  http://localhost:3002" -ForegroundColor Cyan
Write-Host "`nNote: Two new PowerShell windows have been opened for the servers." -ForegroundColor Yellow

Write-Host "`nTo stop the servers:" -ForegroundColor Yellow
Write-Host "- Close the PowerShell windows or use Ctrl+C in each" -ForegroundColor Green
Write-Host "`nOpening browser in 3 seconds..." -ForegroundColor Cyan
Start-Sleep -Seconds 3
Start-Process "http://localhost:3000"
