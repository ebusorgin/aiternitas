# PowerShell скрипт для развёртывания с локальной сборкой
# Сборка происходит на локальной машине, затем файлы загружаются на сервер

$SERVER = "root@82.146.44.126"
$SSH_KEY = "$env:USERPROFILE\.ssh\id_rsa_aiternitas"
$REPO_PATH = "/opt/aiternitas-main"
$SERVICE_NAME = "aiternitas-main.service"
$LOCAL_PATH = $PSScriptRoot

Write-Host "=== Развёртывание с локальной сборкой ===" -ForegroundColor Green

# Шаг 1: Локальная сборка
Write-Host "`n[1/5] Сборка приложения локально..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Ошибка сборки!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Сборка завершена успешно" -ForegroundColor Green

# Шаг 2: Создание временной папки на сервере и очистка старых файлов
Write-Host "`n[2/5] Подготовка сервера..." -ForegroundColor Yellow
ssh -i $SSH_KEY $SERVER "mkdir -p $REPO_PATH/dist && rm -rf $REPO_PATH/dist/*"

# Шаг 3: Загрузка собранных файлов на сервер
Write-Host "`n[3/5] Загрузка файлов на сервер..." -ForegroundColor Yellow

# Загружаем dist папку
Write-Host "  Загрузка dist/..." -ForegroundColor Cyan
scp -i $SSH_KEY -r "$LOCAL_PATH\dist\*" "${SERVER}:${REPO_PATH}/dist/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Ошибка загрузки dist!" -ForegroundColor Red
    exit 1
}

# Загружаем серверные файлы
Write-Host "  Загрузка серверных файлов..." -ForegroundColor Cyan
scp -i $SSH_KEY "$LOCAL_PATH\server.mjs" "${SERVER}:${REPO_PATH}/"
scp -i $SSH_KEY "$LOCAL_PATH\package.json" "${SERVER}:${REPO_PATH}/"
scp -i $SSH_KEY -r "$LOCAL_PATH\server" "${SERVER}:${REPO_PATH}/"

# Загружаем публичные файлы
Write-Host "  Загрузка public/images..." -ForegroundColor Cyan
ssh -i $SSH_KEY $SERVER "mkdir -p $REPO_PATH/public/images"
scp -i $SSH_KEY -r "$LOCAL_PATH\public\images\*" "${SERVER}:${REPO_PATH}/public/images/"

Write-Host "✅ Файлы загружены" -ForegroundColor Green

# Шаг 4: Установка только production зависимостей на сервере
Write-Host "`n[4/5] Установка зависимостей на сервере (только production)..." -ForegroundColor Yellow
ssh -i $SSH_KEY $SERVER "cd $REPO_PATH && npm install --omit=dev"
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️ Предупреждение при установке зависимостей" -ForegroundColor Yellow
}

# Шаг 5: Перезапуск сервиса
Write-Host "`n[5/5] Перезапуск сервиса..." -ForegroundColor Yellow
ssh -i $SSH_KEY $SERVER "systemctl restart $SERVICE_NAME && sleep 3 && systemctl status $SERVICE_NAME | head -15"

Write-Host "`n=== ✅ Развёртывание завершено! ===" -ForegroundColor Green
Write-Host "Сайт: https://aiternitas.ru" -ForegroundColor Cyan

