$ErrorActionPreference = 'Stop'

Write-Host "Checking for Ollama..."
try {
    $ollamaVersion = ollama --version 2>&1
    Write-Host "Ollama is already installed: $ollamaVersion"
    
    $models = ollama list 2>&1
    if ($models -match "llama3") {
        Write-Host "Model llama3 is already downloaded."
    } else {
        Write-Host "Downloading llama3 (this may take a while)..."
        ollama pull llama3
        Write-Host "llama3 downloaded successfully."
    }
    exit 0
} catch {
    Write-Host "Ollama not found. Downloading installer..."
}

$installerPath = "$env:TEMP\OllamaSetup.exe"
$downloadUrl = "https://ollama.com/download/OllamaSetup.exe"

try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $installerPath
    Write-Host "Installer downloaded. Starting silent installation..."
    
    Start-Process -FilePath $installerPath -ArgumentList "/S", "/silent", "/quiet" -Wait -NoNewWindow
    Write-Host "Ollama installed."
    
    $env:Path += ";$env:LOCALAPPDATA\Programs\Ollama"
    
    Write-Host "Starting Ollama server in background..."
    Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
    
    Start-Sleep -Seconds 5
    
    Write-Host "Downloading llama3 model..."
    ollama pull llama3
    Write-Host "llama3 model downloaded successfully."
    
} catch {
    Write-Host "Error installing Ollama: $_"
    exit 1
} finally {
    if (Test-Path $installerPath) {
        Remove-Item $installerPath -Force
    }
}
