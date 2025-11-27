#!/bin/bash
# Скрипт для настройки SMTP на сервере
# Выполните этот скрипт на сервере: bash setup-smtp.sh

set -e

echo "=== Настройка SMTP для Aiternitas ==="
echo ""

# Запрашиваем данные
read -p "SMTP Host (например, smtp.gmail.com): " SMTP_HOST
read -p "SMTP Port (587 для TLS, 465 для SSL) [587]: " SMTP_PORT
SMTP_PORT=${SMTP_PORT:-587}

read -p "SMTP User (ваш email): " SMTP_USER
read -sp "SMTP Password: " SMTP_PASS
echo ""

read -p "From Email [${SMTP_USER}]: " SMTP_FROM
SMTP_FROM=${SMTP_FROM:-$SMTP_USER}

REPO_DIR="/opt/aiternitas-main"
SERVICE_FILE="/etc/systemd/system/aiternitas-main.service"

cd "$REPO_DIR" || { echo "❌ Директория $REPO_DIR не найдена"; exit 1; }

echo ""
echo "=== Обновление .env ==="

# Backup
if [ -f .env ]; then
  cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
  echo "✅ Backup создан"
fi

# Update .env
[ ! -f .env ] && touch .env
sed -i '/^SMTP_/d' .env
sed -i '/^FRONTEND_URL=/d' .env

cat >> .env << EOF

# SMTP Configuration
SMTP_HOST=$SMTP_HOST
SMTP_PORT=$SMTP_PORT
SMTP_USER=$SMTP_USER
SMTP_PASS=$SMTP_PASS
SMTP_FROM=$SMTP_FROM
FRONTEND_URL=https://aiternitas.ru
EOF

echo "✅ .env обновлен"

echo ""
echo "=== Обновление systemd service ==="

if [ -f "$SERVICE_FILE" ]; then
  # Backup
  cp "$SERVICE_FILE" "${SERVICE_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
  echo "✅ Backup service file создан"
  
  # Remove old
  sed -i '/^Environment=SMTP_/d' "$SERVICE_FILE"
  sed -i '/^Environment=FRONTEND_URL/d' "$SERVICE_FILE"
  
  # Add new
  TEMP=$(mktemp)
  awk -v h="$SMTP_HOST" -v p="$SMTP_PORT" -v u="$SMTP_USER" -v pass="$SMTP_PASS" -v f="$SMTP_FROM" -v url="https://aiternitas.ru" '
    /^\[Service\]/ {
      print
      print "Environment=SMTP_HOST=" h
      print "Environment=SMTP_PORT=" p
      print "Environment=SMTP_USER=" u
      print "Environment=SMTP_PASS=" pass
      print "Environment=SMTP_FROM=" f
      print "Environment=FRONTEND_URL=" url
      next
    }
    { print }
  ' "$SERVICE_FILE" > "$TEMP"
  mv "$TEMP" "$SERVICE_FILE"
  
  echo "✅ Service file обновлен"
  
  # Reload and restart
  echo ""
  echo "=== Перезапуск сервиса ==="
  systemctl daemon-reload
  systemctl restart aiternitas-main.service
  
  sleep 3
  
  echo ""
  echo "=== Статус сервиса ==="
  systemctl status aiternitas-main.service --no-pager | head -15
  
  echo ""
  echo "=== Проверка логов ==="
  sleep 2
  journalctl -u aiternitas-main.service -n 30 --no-pager | grep -E 'SMTP|📧' | tail -10 || echo "Логи пока пусты"
else
  echo "⚠️  Service file не найден: $SERVICE_FILE"
fi

echo ""
echo "✅ Настройка SMTP завершена!"

