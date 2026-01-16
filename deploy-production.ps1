# Deployment script for Production (PowerShell version)
# Creates archive of project, copies to remote server, unpacks, installs deps, builds and restarts service.

$SERVER = "root@82.146.44.126"
$SSH_KEY = "$env:USERPROFILE\.ssh\id_rsa_aiternitas"
$REPO_PATH = "/opt/aiternitas-main"
$SERVICE_NAME = "aiternitas-main.service"
$PORT = 3001

Write-Host "=== Stage 1: Prepare and push code ===" -ForegroundColor Cyan

Write-Host "Committing local changes (if any) and pushing to develop..." -ForegroundColor Yellow
git add -A
git commit -m "deploy(production): prepare build and artifacts" 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "No changes to commit" }
git push origin develop

Write-Host "Installing deps and building locally..." -ForegroundColor Yellow
npm install
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Local build failed"; exit 1 }

Write-Host "=== Stage 2: Create archive ===" -ForegroundColor Cyan
if (Test-Path deploy.tar.gz) { Remove-Item deploy.tar.gz -Force }
Write-Host "Creating deploy.tar.gz (excluding node_modules, .git)..." -ForegroundColor Yellow
tar -czf deploy.tar.gz --exclude="node_modules" --exclude=".git" --exclude="deploy.tar.gz" .

Write-Host "=== Stage 3: Transfer to server ===" -ForegroundColor Cyan
scp -i $SSH_KEY deploy.tar.gz "$SERVER`:$REPO_PATH/"

Write-Host "=== Stage 4: Remote unpack, install and restart ===" -ForegroundColor Cyan

$REMOTE_CMD = @"
set -e
mkdir -p $REPO_PATH
cd $REPO_PATH
tar -xzf deploy.tar.gz
rm -f deploy.tar.gz

# Install production deps and build on server (optional, safe-guard)
npm install --omit=dev || true
npm run build || true

# Restart systemd service
systemctl restart $SERVICE_NAME || true
sleep 2
systemctl status $SERVICE_NAME --no-pager | head -n 20
echo "Deployment finished on remote"
 "@

ssh -i $SSH_KEY $SERVER $REMOTE_CMD
Write-Host "Starting remote transfer and deployment..." -ForegroundColor Cyan

# Helper functions for logging and progress
function Write-Log([string]$msg, [string]$level = "INFO") {
  $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  Write-Host "[$ts] [$level] $msg"
}

function Set-Percent([int]$percent, [string]$status) {
  if ($percent -lt 0) { $percent = 0 }
  if ($percent -gt 100) { $percent = 100 }
  Write-Progress -Activity "Deployment" -Status $status -PercentComplete $percent
  Write-Log "$status ($percent`%)"
}

try {
  # Stage allocations for percentage ranges:
  # Stage 1 (local build) already completed -> 0-20
  Set-Percent -percent 10 -status "Local build completed"

  # Stage 2: archive creation 20-35
  Set-Percent -percent 20 -status "Creating archive"
  if (Test-Path deploy.tar.gz) { Remove-Item deploy.tar.gz -Force }
  tar -czf deploy.tar.gz --exclude="node_modules" --exclude=".git" --exclude="deploy.tar.gz" .
  Set-Percent -percent 35 -status "Archive created"

  # Stage 3: transfer 35-70
  Write-Log "Transferring archive to remote: $SERVER:$REPO_PATH"
  Set-Percent -percent 40 -status "Starting transfer (scp)"

  # Start SCP as a process so we can show ongoing progress indicator
  $scpArgs = @("-i",$SSH_KEY,"deploy.tar.gz","$SERVER`:$REPO_PATH/")
  $scpProc = Start-Process -FilePath "scp" -ArgumentList $scpArgs -NoNewWindow -PassThru

  $transferStart = Get-Date
  while (-not $scpProc.HasExited) {
    $elapsed = (Get-Date) - $transferStart
    # Estimate progress using a simple heuristic up to 70%
    $est = 40 + [int]([math]::Min(29, $elapsed.TotalSeconds / 2))
    Set-Percent -percent $est -status "Transferring... elapsed ${([int]$elapsed.TotalSeconds)}s"
    Start-Sleep -Seconds 1
  }

  if ($scpProc.ExitCode -ne 0) {
    Write-Log "SCP failed with exit code $($scpProc.ExitCode)" "ERROR"
    throw "SCP transfer failed"
  }

  Set-Percent -percent 70 -status "Transfer complete"
  Write-Log "Transfer completed successfully"

  # Stage 4: remote unpack & restart 70-100
  Set-Percent -percent 75 -status "Executing remote deploy commands"
  ssh -i $SSH_KEY $SERVER $REMOTE_CMD
  Set-Percent -percent 90 -status "Remote unpack & install done"

  # Verify remote service
  Write-Log "Verifying remote service status and health..."
  $verifyOutput = ssh -i $SSH_KEY $SERVER "ss -ltnp | grep :$PORT || true; curl -I http://localhost:$PORT/ || true"
  Write-Host $verifyOutput

  Set-Percent -percent 100 -status "Deployment finished"
  Write-Host "=== Deployment completed locally ===" -ForegroundColor Green
} catch {
  Write-Log "Deployment failed: $($_.Exception.Message)" "ERROR"
  Set-Percent -percent 0 -status "Deployment failed"
  throw
} finally {
  if (Test-Path deploy.tar.gz) { Remove-Item deploy.tar.gz -Force }
  Write-Progress -Activity "Deployment" -Completed
}

