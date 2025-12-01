# PowerShell скрипт для развёртывания на сервере
$SERVER = "root@82.146.44.126"
$SSH_KEY = "$env:USERPROFILE\.ssh\id_rsa_aiternitas"
$REPO_PATH = "/opt/aiternitas-main"
$SERVICE_NAME = "aiternitas-main.service"

Write-Host "=== Подключение к серверу и обновление ===" -ForegroundColor Green

# Git pull
Write-Host "`nВыполнение git pull..." -ForegroundColor Yellow
ssh -i $SSH_KEY $SERVER "cd $REPO_PATH && git pull origin production"

# Установка зависимостей
Write-Host "`nУстановка зависимостей..." -ForegroundColor Yellow
ssh -i $SSH_KEY $SERVER "cd $REPO_PATH && npm install"

# Сборка приложения
Write-Host "`nСборка приложения..." -ForegroundColor Yellow
ssh -i $SSH_KEY $SERVER "cd $REPO_PATH && npm run build"

# Перезапуск сервиса
Write-Host "`nПерезапуск сервиса..." -ForegroundColor Yellow
ssh -i $SSH_KEY $SERVER "systemctl restart $SERVICE_NAME && sleep 2 && systemctl status $SERVICE_NAME | head -10"

Write-Host "`n=== Развёртывание завершено! ===" -ForegroundColor Green

