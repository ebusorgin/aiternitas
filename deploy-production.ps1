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
git commit -m "deploy(production): prepare build and artifacts" || Write-Host "No changes to commit"
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

Write-Host "=== Deployment completed locally ===" -ForegroundColor Green
if (Test-Path deploy.tar.gz) { Remove-Item deploy.tar.gz -Force }

Write-Host "`nVerifying remote service and health endpoint..." -ForegroundColor Cyan
ssh -i $SSH_KEY $SERVER "ss -ltnp | grep :$PORT || true; curl -I http://localhost:$PORT/ || true"

