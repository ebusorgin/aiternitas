#!/bin/bash
# Проверка TOR и TOR_PROXY на сервере (запускать в /opt/aiternitas-main).
# Если 403 Country not supported — проверьте вывод этого скрипта.

cd "${1:-/opt/aiternitas-main}"
echo "=== Проверка TOR для OpenAI ==="
echo ""

echo "1. TOR_PROXY в .env.production:"
if [ -f .env.production ]; then
  if grep -q '^TOR_PROXY=' .env.production 2>/dev/null; then
    grep '^TOR_PROXY=' .env.production | sed 's/=.*/=***/'
    echo "   OK — переменная задана"
  else
    echo "   НЕТ — добавьте: TOR_PROXY=socks5://127.0.0.1:9050"
  fi
else
  echo "   Файл .env.production не найден"
fi
echo ""

echo "2. Сервис TOR:"
if systemctl is-active --quiet tor 2>/dev/null || sudo systemctl is-active --quiet tor 2>/dev/null; then
  echo "   OK — tor.service запущен"
else
  echo "   НЕ ЗАПУЩЕН — выполните: sudo systemctl start tor && sudo systemctl enable tor"
fi
echo ""

echo "3. EnvironmentFile в systemd unit:"
UNIT="/etc/systemd/system/aiternitas-main.service"
if [ -f "$UNIT" ]; then
  if grep -q '^EnvironmentFile=' "$UNIT" 2>/dev/null; then
    echo "   OK — unit загружает .env.production"
  else
    echo "   НЕТ — раскомментируйте EnvironmentFile= в $UNIT и выполните: sudo systemctl daemon-reload && sudo systemctl restart aiternitas-main"
  fi
else
  echo "   Unit не найден: $UNIT"
fi
echo ""

echo "4. Последние логи приложения (ищем TOR / TOR_PROXY):"
if journalctl -u aiternitas-main.service -n 30 --no-pager 2>/dev/null | grep -E 'TOR|OpenAI|403' | tail -5; then
  true
else
  echo "   (запустите: journalctl -u aiternitas-main.service -n 50 -f)"
fi
echo ""
echo "Если TOR_PROXY задан и tor запущен — перезапустите приложение: sudo systemctl restart aiternitas-main"
