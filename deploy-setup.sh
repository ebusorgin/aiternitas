#!/bin/bash
# Скрипт для первоначальной настройки aiternitas.ru на сервере

SERVER="root@82.146.44.126"
SSH_KEY="$HOME/.ssh/id_rsa_aiternitas"
REPO_PATH="/opt/aiternitas-main"
REPO_URL="https://github.com/ebusorgin/aiternitas-main.git"
SERVICE_NAME="aiternitas-main.service"
SERVICE_USER="root"

echo "=== Настройка Aiternitas Main на сервере ==="
echo ""

# Проверка подключения
echo "1. Проверка подключения к серверу..."
ssh -i "$SSH_KEY" -o ConnectTimeout=10 $SERVER "echo 'Подключение успешно'" || {
    echo "Ошибка: Не удалось подключиться к серверу"
    exit 1
}

# Клонирование репозитория
echo ""
echo "2. Клонирование репозитория..."
if ssh -i "$SSH_KEY" $SERVER "test -d $REPO_PATH"; then
    echo "Репозиторий уже существует, пропускаем клонирование"
else
    ssh -i "$SSH_KEY" $SERVER "mkdir -p $(dirname $REPO_PATH) && cd $(dirname $REPO_PATH) && git clone $REPO_URL aiternitas-main" || {
        echo "Ошибка при клонировании репозитория"
        exit 1
    }
fi

# Переключение на ветку production
echo ""
echo "3. Переключение на ветку production..."
ssh -i "$SSH_KEY" $SERVER "cd $REPO_PATH && git checkout production 2>/dev/null || git checkout -b production && git pull origin production" || {
    echo "Внимание: Не удалось переключиться на production, используем текущую ветку"
}

# Установка зависимостей
echo ""
echo "4. Установка зависимостей..."
ssh -i "$SSH_KEY" $SERVER "cd $REPO_PATH && npm install --production" || {
    echo "Ошибка при установке зависимостей"
    exit 1
}

# Создание .env файла (если не существует)
echo ""
echo "5. Проверка .env файла..."
ssh -i "$SSH_KEY" $SERVER "cd $REPO_PATH && test -f .env || (cp .env.example .env && echo 'Создан .env файл из примера. Заполните настройки!')"

# Создание директорий для uploads
echo ""
echo "6. Создание директорий для uploads..."
ssh -i "$SSH_KEY" $SERVER "cd $REPO_PATH && mkdir -p uploads/avatars"

# Создание systemd service
echo ""
echo "7. Создание systemd service..."
ssh -i "$SSH_KEY" $SERVER "cat > /etc/systemd/system/$SERVICE_NAME << 'EOF'
[Unit]
Description=Aiternitas Main Service
After=network.target postgresql.service

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$REPO_PATH
Environment=\"NODE_ENV=production\"
Environment=\"PORT=3001\"
Environment=\"HOST=0.0.0.0\"
ExecStart=/usr/bin/node $REPO_PATH/server.mjs
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
" || {
    echo "Ошибка при создании systemd service"
    exit 1
}

# Перезагрузка systemd и запуск сервиса
echo ""
echo "8. Запуск сервиса..."
ssh -i "$SSH_KEY" $SERVER "systemctl daemon-reload && systemctl enable $SERVICE_NAME && systemctl restart $SERVICE_NAME && sleep 2 && systemctl status $SERVICE_NAME | head -15" || {
    echo "Ошибка при запуске сервиса"
    exit 1
}

# Настройка nginx
echo ""
echo "9. Настройка nginx..."
echo "Скопируйте nginx-main.conf на сервер и добавьте в конфигурацию nginx"
echo "Команда для копирования:"
echo "scp -i \"$SSH_KEY\" nginx-main.conf $SERVER:/etc/nginx/sites-available/aiternitas.ru"
echo ""
echo "На сервере выполните:"
echo "ln -s /etc/nginx/sites-available/aiternitas.ru /etc/nginx/sites-enabled/"
echo "nginx -t && systemctl reload nginx"

echo ""
echo "=== Настройка завершена ==="
echo ""
echo "ВАЖНО:"
echo "1. Заполните настройки в файле $REPO_PATH/.env на сервере (DB_HOST, DB_PASSWORD, SESSION_SECRET)"
echo "2. Настройте nginx конфигурацию (см. выше)"
echo "3. Убедитесь, что PostgreSQL доступен и база данных создана"

