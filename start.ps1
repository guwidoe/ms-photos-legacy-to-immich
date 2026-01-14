# Start Face Migration Tool
# This script starts both the backend and frontend servers

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Face Migration Tool - Starting..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path ".\backend\main.py")) {
    Write-Host "Error: Please run this script from the webapp directory" -ForegroundColor Red
    exit 1
}

# Add common Node.js paths to current session if npm is not found
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    $commonPaths = @(
        "C:\Program Files\nodejs",
        "C:\Program Files (x86)\nodejs",
        "$env:APPDATA\npm"
    )
    foreach ($p in $commonPaths) {
        if (Test-Path $p) {
            $env:PATH += ";$p"
            if (Get-Command npm -ErrorAction SilentlyContinue) { 
                Write-Host "Found npm in $p - added to PATH for this session" -ForegroundColor Gray
                break 
            }
        }
    }
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "Warning: npm not found in PATH. Frontend might fail to start." -ForegroundColor Yellow
}

# Start backend
Write-Host "Starting backend server..." -ForegroundColor Yellow
$backendJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD\backend
    if (Test-Path ".\venv\Scripts\activate.ps1") {
        & .\venv\Scripts\activate.ps1
    }
    python -m uvicorn main:app --port 8000
}

# Wait a moment for backend to start
Start-Sleep -Seconds 2

# Start frontend
Write-Host "Starting frontend server..." -ForegroundColor Yellow
$frontendJob = Start-Job -ScriptBlock {
    # Add common Node.js paths if npm is not found
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        $commonPaths = @(
            "C:\Program Files\nodejs",
            "C:\Program Files (x86)\nodejs",
            "$env:APPDATA\npm"
        )
        foreach ($p in $commonPaths) {
            if (Test-Path $p) {
                $env:PATH += ";$p"
                if (Get-Command npm -ErrorAction SilentlyContinue) { break }
            }
        }
    }
    
    Set-Location $using:PWD\frontend
    npm run dev
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Servers starting..." -ForegroundColor Green
Write-Host "  Backend:  http://localhost:8000" -ForegroundColor White
Write-Host "  Frontend: http://localhost:5173" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C to stop all servers" -ForegroundColor Gray
Write-Host ""

# Wait and show output
try {
    while ($true) {
        # Receive and display job output
        Receive-Job -Job $backendJob -ErrorAction SilentlyContinue
        Receive-Job -Job $frontendJob -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }
}
finally {
    Write-Host ""
    Write-Host "Stopping servers..." -ForegroundColor Yellow
    Stop-Job -Job $backendJob -ErrorAction SilentlyContinue
    Stop-Job -Job $frontendJob -ErrorAction SilentlyContinue
    Remove-Job -Job $backendJob -Force -ErrorAction SilentlyContinue
    Remove-Job -Job $frontendJob -Force -ErrorAction SilentlyContinue
    Write-Host "Done." -ForegroundColor Green
}
