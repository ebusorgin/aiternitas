# Deployment script for Local Build + PM2 (PowerShell version)
# Generic template — set $SUBDOMAIN to target subdomain (without domain suffix)
$SUBDOMAIN = "your-subdomain"   # e.g. "app1" -> final domain will be app1.aiternitas.ru
$SERVER = "root@82.146.44.126"
$SSH_KEY = "$env:USERPROFILE\.ssh\id_rsa_aiternitas"
# Remote repository path — will be constructed from $SUBDOMAIN
$REPO_PATH = "/home/$($SUBDOMAIN).aiternitas.ru"
$PM2_NAME = "aiternitas-$SUBDOMAIN"
$PORT = 3003

Write-Host "=== Stage 1: Local Build ===" -ForegroundColor Cyan

# Ensure working tree is clean-ish and push to remote
Write-Host "Pushing to Git..." -ForegroundColor Yellow
git add -A
git commit -m "deploy: add deploy script for blagojevic subdomain" || Write-Host "No changes to commit"
git push origin main

Write-Host "Building project (frontend + backend if applicable)..." -ForegroundColor Yellow
# If repository has separate frontend/backend folders, adjust below.
if (Test-Path frontend) {
  Push-Location frontend
  npm install
  npm run build
  if ($LASTEXITCODE -ne 0) { Write-Error "Frontend build failed"; exit 1 }
  Pop-Location
}

if (Test-Path backend) {
  Push-Location backend
  npm install
  npm run build
  if ($LASTEXITCODE -ne 0) { Write-Error "Backend build failed"; exit 1 }
  Pop-Location
}

# For single-repo (this project): run install and build in repo root
if (!(Test-Path frontend) -and !(Test-Path backend)) {
  npm install
  npm run build
  if ($LASTEXITCODE -ne 0) { Write-Error "Build failed"; exit 1 }
}

Write-Host "=== Stage 2: Preparing Artifacts (Source + Build) ===" -ForegroundColor Cyan
if (Test-Path deploy.tar.gz) { Remove-Item deploy.tar.gz -Force }

Write-Host "Creating archive with source and build..." -ForegroundColor Yellow
tar -czf deploy.tar.gz --exclude="node_modules" --exclude=".git" --exclude="deploy_temp" --exclude="deploy.tar.gz" .

Write-Host "=== Stage 3: Transferring to Server ===" -ForegroundColor Cyan
scp -i $SSH_KEY deploy.tar.gz "$SERVER`:$REPO_PATH/"

Write-Host "Uploading Nginx configuration if present..." -ForegroundColor Yellow
# Expect nginx config to be named like nginx-<subdomain>.conf, or place generic file `nginx-subdomain.conf`
$localNginxConf = "nginx-$SUBDOMAIN.conf"
if (Test-Path $localNginxConf) {
  $remoteNginxPath = "/etc/nginx/sites-available/$($SUBDOMAIN).aiternitas.ru"
  scp -i $SSH_KEY $localNginxConf "$SERVER`:$remoteNginxPath"
}

Write-Host "=== Stage 4: Unpacking and Restarting Services ===" -ForegroundColor Cyan

$REMOTE_CMD = @"
set -e
cd $REPO_PATH
tar -xzf deploy.tar.gz
rm -f deploy.tar.gz

# Install dependencies (production)
npm install --omit=dev || true

# Stop existing PM2 process (if any) and start new one
pm2 delete $PM2_NAME || true

# Start backend - try to start server.mjs or dist/server.js depending on project layout
if [ -f dist/server.js ]; then
  PORT=$PORT pm2 start dist/server.js --name '$PM2_NAME' --update-env
elif [ -f server.mjs ]; then
  PORT=$PORT pm2 start server.mjs --name '$PM2_NAME' --update-env
elif [ -f index.js ]; then
  PORT=$PORT pm2 start index.js --name '$PM2_NAME' --update-env
else
  echo "No obvious server entry (dist/server.js or server.mjs). Adjust deploy script on server."
fi

pm2 save || true

# Nginx reload if config was uploaded
if [ -f /etc/nginx/sites-available/$($SUBDOMAIN).aiternitas.ru ]; then
  nginx -t && systemctl reload nginx || true
fi

echo "Deployment completed successfully"
"@

ssh -i $SSH_KEY $SERVER $REMOTE_CMD

Write-Host "=== Deployment Completed! ===" -ForegroundColor Green
if (Test-Path deploy.tar.gz) { Remove-Item deploy.tar.gz -Force }

Write-Host "`nVerifying deployment..." -ForegroundColor Cyan
ssh -i $SSH_KEY $SERVER "pm2 list; curl -I http://localhost:$PORT/ || true"

