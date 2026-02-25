#!/bin/bash
# Скрипт для развёртывания с локальной сборкой
# Сборка происходит на локальной машине, затем файлы загружаются на сервер

SERVER="root@82.146.44.126"
SSH_KEY="$HOME/.ssh/id_rsa_aiternitas"
REPO_PATH="/opt/aiternitas-main"
SERVICE_NAME="aiternitas-main.service"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Развёртывание с локальной сборкой ==="

# Шаг 1: Локальная сборка
echo ""
echo "[1/5] Сборка приложения локально..."
cd "$SCRIPT_DIR"
npm run build || {
    echo "❌ Ошибка сборки!"
    exit 1
}
echo "✅ Сборка завершена успешно"

# Шаг 2: Подготовка сервера
echo ""
echo "[2/5] Подготовка сервера..."
ssh -i "$SSH_KEY" $SERVER "mkdir -p $REPO_PATH/dist && rm -rf $REPO_PATH/dist/*"

# Шаг 3: Загрузка файлов
echo ""
echo "[3/5] Загрузка файлов на сервер..."

echo "  Загрузка dist/..."
scp -i "$SSH_KEY" -r "$SCRIPT_DIR/dist/"* "$SERVER:$REPO_PATH/dist/" || {
    echo "❌ Ошибка загрузки dist!"
    exit 1
}

echo "  Загрузка серверных файлов..."
scp -i "$SSH_KEY" "$SCRIPT_DIR/server.mjs" "$SERVER:$REPO_PATH/"
scp -i "$SSH_KEY" "$SCRIPT_DIR/package.json" "$SERVER:$REPO_PATH/"
scp -i "$SSH_KEY" -r "$SCRIPT_DIR/server" "$SERVER:$REPO_PATH/"

echo "  Загрузка public/images..."
ssh -i "$SSH_KEY" $SERVER "mkdir -p $REPO_PATH/public/images"
scp -i "$SSH_KEY" -r "$SCRIPT_DIR/public/images/"* "$SERVER:$REPO_PATH/public/images/"

echo "  Загрузка scripts/ (примеры конфигов, генератор SESSION_SECRET)..."
ssh -i "$SSH_KEY" $SERVER "mkdir -p $REPO_PATH/scripts"
scp -i "$SSH_KEY" -r "$SCRIPT_DIR/scripts/"* "$SERVER:$REPO_PATH/scripts/" 2>/dev/null || true

echo "✅ Файлы загружены"

# Шаг 4: Настройка сервера (создаёт .env.production и systemd при первом запуске, ставит зависимости, перезапускает сервис)
echo ""
echo "[4/5] Настройка и запуск на сервере..."
ssh -i "$SSH_KEY" $SERVER "cd $REPO_PATH && chmod +x scripts/setup-server.sh 2>/dev/null; bash scripts/setup-server.sh $REPO_PATH"

# Шаг 5: Проверка
echo ""
echo "[5/5] Проверка..."
ssh -i "$SSH_KEY" $SERVER "systemctl is-active --quiet $SERVICE_NAME && echo 'Сервис запущен' || echo 'Сервис не запущен'"

echo ""
echo "=== ✅ Развёртывание завершено! ==="
echo "Сайт: https://aiternitas.ru"
echo "При первом деплое проверьте на сервере .env.production (DB_PASSWORD и др.)."

