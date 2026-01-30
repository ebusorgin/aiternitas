#!/bin/bash
# Полная настройка сервера (запускать на сервере в /opt/aiternitas-main).
# Создаёт .env.production, генерирует SESSION_SECRET, ставит TOR и systemd-сервис.
# Можно запускать повторно — уже созданные файлы не перезаписываются.

set -e
REPO_PATH="${1:-/opt/aiternitas-main}"
cd "$REPO_PATH"
SERVICE_NAME="aiternitas-main.service"
TOR_PROXY_VALUE="socks5://127.0.0.1:9050"

echo "=== Настройка Aiternitas ($REPO_PATH) ==="

# 1. .env.production
if [ ! -f .env.production ]; then
  echo "[1/5] Создаю .env.production из примера..."
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
  echo "[1/5] .env.production уже есть, не трогаю."
fi

# 2. TOR (для обхода 403 Country not supported при запросах к OpenAI)
echo "[2/5] TOR (прокси для OpenAI)..."
if command -v tor >/dev/null 2>&1; then
  echo "    TOR уже установлен."
else
  echo "    Устанавливаю TOR..."
  ( sudo apt-get update -qq && sudo apt-get install -y tor ) || \
  ( apt-get update -qq && apt-get install -y tor ) || {
    echo "    ⚠️ Не удалось установить TOR (apt-get). Установите вручную: apt-get install -y tor"
    true
  }
fi
if systemctl is-active --quiet tor 2>/dev/null || sudo systemctl is-active --quiet tor 2>/dev/null; then
  echo "    TOR запущен."
else
  ( sudo systemctl start tor 2>/dev/null && sudo systemctl enable tor 2>/dev/null ) || \
  ( systemctl start tor 2>/dev/null && systemctl enable tor 2>/dev/null ) || true
fi
if [ -f .env.production ] && ! grep -q '^TOR_PROXY=' .env.production 2>/dev/null; then
  echo "TOR_PROXY=$TOR_PROXY_VALUE" >> .env.production
  echo "    В .env.production добавлен TOR_PROXY=$TOR_PROXY_VALUE"
fi

# 3. systemd unit (sudo если нет прав на запись в /etc/systemd)
UNIT_PATH="/etc/systemd/system/$SERVICE_NAME"
if [ ! -f "$UNIT_PATH" ]; then
  echo "[3/5] Устанавливаю systemd-сервис..."
  UNIT_FILE="/tmp/$SERVICE_NAME"
  cp scripts/aiternitas-main.service.example "$UNIT_FILE"
  sed -i 's|^# EnvironmentFile=|EnvironmentFile=|' "$UNIT_FILE"
  ( sudo cp "$UNIT_FILE" "$UNIT_PATH" && sudo systemctl daemon-reload && sudo systemctl enable $SERVICE_NAME ) || \
  ( cp "$UNIT_FILE" "$UNIT_PATH" 2>/dev/null && systemctl daemon-reload && systemctl enable $SERVICE_NAME )
  rm -f "$UNIT_FILE"
  echo "    Сервис установлен и включён в автозагрузку."
else
  echo "[3/5] Сервис $SERVICE_NAME уже установлен."
  # Раскомментировать EnvironmentFile= если ещё закомментирован (чтобы подхватить TOR_PROXY из .env.production)
  if grep -q '^# EnvironmentFile=' "$UNIT_PATH" 2>/dev/null; then
    ( sudo sed -i 's|^# EnvironmentFile=|EnvironmentFile=|' "$UNIT_PATH" && sudo systemctl daemon-reload ) || \
    ( sed -i 's|^# EnvironmentFile=|EnvironmentFile=|' "$UNIT_PATH" 2>/dev/null && systemctl daemon-reload ) || true
    echo "    EnvironmentFile раскомментирован в unit (переменные из .env.production теперь подхватываются)."
  fi
  # Добавить tor.service в After= если ещё нет (обновление при деплое)
  if ! grep -q 'tor\.service' "$UNIT_PATH" 2>/dev/null; then
    ( sudo sed -i 's/^After=network\.target postgresql\.service$/After=network.target postgresql.service tor.service/' "$UNIT_PATH" && sudo systemctl daemon-reload ) || \
    ( sed -i 's/^After=network\.target postgresql\.service$/After=network.target postgresql.service tor.service/' "$UNIT_PATH" 2>/dev/null && systemctl daemon-reload ) || true
  fi
fi

# 4. Зависимости
echo "[4/5] Установка зависимостей..."
npm install --omit=dev

# 5. Запуск
echo "[5/5] Перезапуск сервиса..."
( sudo systemctl restart $SERVICE_NAME && sudo systemctl status $SERVICE_NAME --no-pager | head -12 ) || \
( systemctl restart $SERVICE_NAME && sleep 2 && systemctl status $SERVICE_NAME --no-pager | head -12 )

echo ""
echo "=== Готово. Сайт: https://aiternitas.ru ==="
echo "Логи: journalctl -u $SERVICE_NAME -f"
