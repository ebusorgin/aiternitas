$ErrorActionPreference = "Stop"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Aiternitas Environment Startup Script  " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Docker Desktop
Write-Host "1. Checking Docker Desktop..." -ForegroundColor Yellow
$dockerRunning = Get-Process "Docker Desktop" -ErrorAction SilentlyContinue
if (-not $dockerRunning) {
    Write-Host "   Starting Docker Desktop..." -ForegroundColor Magenta
    Start-Process -FilePath "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    Write-Host "   Waiting 30 seconds for Docker to initialize..." -ForegroundColor Yellow
    Start-Sleep -Seconds 30
} else {
    Write-Host "   Docker Desktop is already running." -ForegroundColor Green
}

# 2. Database
Write-Host "2. Checking PostgreSQL database..." -ForegroundColor Yellow
$postgresStatus = docker ps -f name=task-management-postgres --format "{{.Status}}"
if (-not $postgresStatus) {
    $postgresExists = docker ps -a -f name=task-management-postgres --format "{{.Names}}"
    if ($postgresExists) {
        Write-Host "   Starting container task-management-postgres..." -ForegroundColor Magenta
        docker start task-management-postgres | Out-Null
        Write-Host "   Database started." -ForegroundColor Green
    } else {
        Write-Host "   WARNING: Container task-management-postgres not found!" -ForegroundColor Red
    }
} else {
    Write-Host "   Database is already running." -ForegroundColor Green
}

# 3. Sandbox Image
Write-Host "3. Checking Docker image aiternitas-sandbox..." -ForegroundColor Yellow
$sandboxImage = docker images -q aiternitas-sandbox:latest
if (-not $sandboxImage) {
    Write-Host "   Image not found. Building sandbox image..." -ForegroundColor Magenta
    docker build -t aiternitas-sandbox:latest server/docker
    Write-Host "   Build completed." -ForegroundColor Green
} else {
    Write-Host "   Image aiternitas-sandbox already exists." -ForegroundColor Green
}

# 4. Ollama
Write-Host "4. Starting Ollama..." -ForegroundColor Yellow
$ollamaRunning = Get-Process "ollama" -ErrorAction SilentlyContinue
if (-not $ollamaRunning) {
    Write-Host "   Starting Ollama server..." -ForegroundColor Magenta
    Start-Process -FilePath "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" -ArgumentList "serve" -WindowStyle Hidden
    Write-Host "   Ollama started in background." -ForegroundColor Green
} else {
    Write-Host "   Ollama is already running." -ForegroundColor Green
}

Write-Host ""
Write-Host "All infrastructure services are ready." -ForegroundColor Green
Write-Host "Starting Frontend and Backend monitoring (via concurrently)..." -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host "=========================================" -ForegroundColor Cyan

# 5. NPM Start
npm start
