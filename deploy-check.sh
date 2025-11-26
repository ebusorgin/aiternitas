#!/bin/bash
# Скрипт для проверки статуса aiternitas.ru на сервере

SERVER="root@82.146.44.126"
SSH_KEY="$HOME/.ssh/id_rsa_aiternitas"
REPO_PATH="/opt/aiternitas-main"
SERVICE_NAME="aiternitas-main.service"

echo "Проверка подключения к серверу..."
ssh -i "$SSH_KEY" -o ConnectTimeout=10 $SERVER "echo 'Подключение успешно'" || {
    echo "Ошибка: Не удалось подключиться к серверу"
    exit 1
}

echo "Проверка наличия репозитория..."
ssh -i "$SSH_KEY" $SERVER "test -d $REPO_PATH" || {
    echo "Внимание: Репозиторий не найден по пути $REPO_PATH"
    exit 1
}

echo "Переход в директорию репозитория..."
ssh -i "$SSH_KEY" $SERVER "cd $REPO_PATH && pwd"

echo "Проверка статуса git..."
ssh -i "$SSH_KEY" $SERVER "cd $REPO_PATH && git status"

echo "Проверка удаленных репозиториев..."
ssh -i "$SSH_KEY" $SERVER "cd $REPO_PATH && git remote -v"

echo "Проверка последних коммитов..."
ssh -i "$SSH_KEY" $SERVER "cd $REPO_PATH && git log --oneline -5"

echo "Проверка статуса сервиса..."
ssh -i "$SSH_KEY" $SERVER "systemctl status $SERVICE_NAME --no-pager | head -15"

echo ""
echo "Для обновления выполните:"
echo "ssh -i \"$SSH_KEY\" $SERVER 'cd $REPO_PATH && git pull origin production'"

