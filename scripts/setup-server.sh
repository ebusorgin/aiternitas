#!/bin/bash
# Полная настройка сервера (запускать на сервере в /opt/aiternitas-main).
# Создаёт .env.production, генерирует SESSION_SECRET, ставит systemd-сервис.
# Можно запускать повторно — уже созданные файлы не перезаписываются.

set -e
REPO_PATH="${1:-/opt/aiternitas-main}"
cd "$REPO_PATH"
SERVICE_NAME="aiternitas-main.service"

echo "=== Настройка Aiternitas ($REPO_PATH) ==="

# 1. .env.production
if [ ! -f .env.production ]; then
  echo "[1/4] Создаю .env.production из примера..."
  cp scripts/env.production.example .env.production
  chmod 600 .env.production
  SECRET=$(node scripts/generate-session-secret.mjs 2>/dev/null | grep -E '^[a-f0-9]{64}$' || openssl rand -hex 32)
  if [ -n "$SECRET" ]; then
    sed -i "s/^SESSION_SECRET=.*/SESSION_SECRET=$SECRET/" .env.production 2>/dev/null || \
      echo "SESSION_SECRET=$SECRET" >> .env.production
    echo "    SESSION_SECRET сгенерирован и записан."
  fi
  echo "    Отредактируйте .env.production: укажите DB_PASSWORD и при необходимости SMTP_*, GOOGLE_*"
else
  echo "[1/4] .env.production уже есть, не трогаю."
fi

# 2. systemd unit (sudo если нет прав на запись в /etc/systemd)
if [ ! -f /etc/systemd/system/$SERVICE_NAME ]; then
  echo "[2/4] Устанавливаю systemd-сервис..."
  UNIT_FILE="/tmp/$SERVICE_NAME"
  cp scripts/aiternitas-main.service.example "$UNIT_FILE"
  sed -i 's|^# EnvironmentFile=|EnvironmentFile=|' "$UNIT_FILE"
  ( sudo cp "$UNIT_FILE" /etc/systemd/system/$SERVICE_NAME && sudo systemctl daemon-reload && sudo systemctl enable $SERVICE_NAME ) || \
  ( cp "$UNIT_FILE" /etc/systemd/system/$SERVICE_NAME 2>/dev/null && systemctl daemon-reload && systemctl enable $SERVICE_NAME )
  rm -f "$UNIT_FILE"
  echo "    Сервис установлен и включён в автозагрузку."
else
  echo "[2/4] Сервис $SERVICE_NAME уже установлен."
fi

# 3. Зависимости
echo "[3/4] Установка зависимостей..."
npm install --omit=dev

# 4. Запуск
echo "[4/4] Перезапуск сервиса..."
( sudo systemctl restart $SERVICE_NAME && sudo systemctl status $SERVICE_NAME --no-pager | head -12 ) || \
( systemctl restart $SERVICE_NAME && sleep 2 && systemctl status $SERVICE_NAME --no-pager | head -12 )

echo ""
echo "=== Готово. Сайт: https://aiternitas.ru ==="
echo "Логи: journalctl -u $SERVICE_NAME -f"
