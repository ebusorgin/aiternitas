# Aiternitas Startup Script

Write-Host "Starting Docker infrastructure (RabbitMQ, Redis, Postgres)..." -ForegroundColor Cyan
docker-compose -f docker-compose.infrastructure.yml up -d

Write-Host "Waiting for infrastructure to initialize (5 seconds)..."
Start-Sleep -Seconds 5

Write-Host "Starting Microservices..." -ForegroundColor Cyan

function Start-Microservice {
    param([string]$name, [string]$path)
    Write-Host "Starting $name..." -ForegroundColor Green
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd $path; npm run dev" -WindowStyle Normal
}

Start-Microservice -name "Gateway Server" -path ".\microservices\gatewayServer"
Start-Microservice -name "User Server" -path ".\microservices\userServer"
Start-Microservice -name "AI Server" -path ".\microservices\aiServer"
Start-Microservice -name "Dep Server" -path ".\microservices\depServer"
Start-Microservice -name "Worker Server" -path ".\microservices\workerServer"

Write-Host "Starting Frontend Client..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd .\client; npm run dev" -WindowStyle Normal

Write-Host "All system components have been launched!" -ForegroundColor Yellow
