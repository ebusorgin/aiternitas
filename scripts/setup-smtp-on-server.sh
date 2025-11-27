#!/bin/bash
# Скрипт для настройки SMTP на сервере
# Этот скрипт будет выполнен на сервере через SSH

set -e

REPO_DIR="/opt/aiternitas-main"
SERVICE_NAME="aiternitas-main.service"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}"

echo "=== Настройка SMTP на сервере ==="
echo ""

cd "$REPO_DIR" || exit 1

# Проверяем текущие настройки
echo "1. Проверка текущих настроек SMTP..."
if [ -f .env ]; then
    echo "   Найден .env файл"
    if grep -q "^SMTP_HOST" .env; then
        echo "   Текущие SMTP настройки:"
        grep "^SMTP_" .env || true
    else
        echo "   SMTP настройки не найдены в .env"
    fi
else
    echo "   .env файл не найден, будет создан"
fi

echo ""
echo "2. Проверка systemd service..."
if [ -f "$SERVICE_FILE" ]; then
    echo "   Service file найден"
    if grep -q "Environment=SMTP_HOST" "$SERVICE_FILE"; then
        echo "   Текущие SMTP переменные в systemd:"
        grep "Environment=SMTP_" "$SERVICE_FILE" || true
    else
        echo "   SMTP переменные не найдены в systemd"
    fi
else
    echo "   Service file не найден: $SERVICE_FILE"
fi

echo ""
echo "3. Проверка последних логов email..."
journalctl -u "$SERVICE_NAME" -n 50 --no-pager | grep -E 'SMTP|Email|email|📧|✅|❌' | tail -10 || echo "   Нет логов email"

echo ""
echo "=== Информация для настройки ==="
echo ""
echo "Для настройки SMTP необходимо:"
echo "1. SMTP_HOST (например: smtp.gmail.com)"
echo "2. SMTP_PORT (например: 587)"
echo "3. SMTP_USER (ваш email)"
echo "4. SMTP_PASS (пароль приложения)"
echo "5. SMTP_FROM (опционально, по умолчанию = SMTP_USER)"
echo "6. FRONTEND_URL (https://aiternitas.ru)"
echo ""
echo "Если переменные окружения SMTP_* установлены, они будут использованы."
echo "Иначе нужно будет настроить вручную."

# Проверяем переменные окружения
if [ -n "$SMTP_HOST" ] && [ -n "$SMTP_USER" ] && [ -n "$SMTP_PASS" ]; then
    echo ""
    echo "=== Найдены переменные окружения SMTP, настраиваю... ==="
    
    SMTP_PORT="${SMTP_PORT:-587}"
    SMTP_FROM="${SMTP_FROM:-$SMTP_USER}"
    FRONTEND_URL="${FRONTEND_URL:-https://aiternitas.ru}"
    
    # Backup .env
    if [ -f .env ]; then
        cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
        echo "✅ Создан backup .env"
    fi
    
    # Обновляем .env
    if [ ! -f .env ]; then
        touch .env
    fi
    
    # Удаляем старые SMTP настройки
    sed -i '/^SMTP_/d' .env
    sed -i '/^FRONTEND_URL=/d' .env
    
    # Добавляем новые
    {
        echo ""
        echo "# SMTP Configuration for Email Verification"
        echo "SMTP_HOST=$SMTP_HOST"
        echo "SMTP_PORT=$SMTP_PORT"
        echo "SMTP_USER=$SMTP_USER"
        echo "SMTP_PASS=$SMTP_PASS"
        echo "SMTP_FROM=$SMTP_FROM"
        echo "FRONTEND_URL=$FRONTEND_URL"
    } >> .env
    
    echo "✅ SMTP настройки добавлены в .env"
    echo ""
    echo "Обновленные настройки:"
    grep "^SMTP_\|^FRONTEND_URL=" .env
    
    # Обновляем systemd service
    if [ -f "$SERVICE_FILE" ]; then
        echo ""
        echo "=== Обновление systemd service ==="
        
        # Backup service file
        cp "$SERVICE_FILE" "${SERVICE_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
        echo "✅ Создан backup service file"
        
        # Удаляем старые Environment строки
        sed -i '/^Environment=SMTP_/d' "$SERVICE_FILE"
        sed -i '/^Environment=FRONTEND_URL/d' "$SERVICE_FILE"
        
        # Находим секцию [Service] и добавляем Environment после неё
        if grep -q "^\[Service\]" "$SERVICE_FILE"; then
            # Добавляем Environment переменные после [Service]
            # Используем временный файл для безопасности
            TEMP_FILE=$(mktemp)
            awk -v host="$SMTP_HOST" -v port="$SMTP_PORT" -v user="$SMTP_USER" -v pass="$SMTP_PASS" -v from="$SMTP_FROM" -v url="$FRONTEND_URL" '
                /^\[Service\]/ {
                    print
                    print "Environment=SMTP_HOST=" host
                    print "Environment=SMTP_PORT=" port
                    print "Environment=SMTP_USER=" user
                    print "Environment=SMTP_PASS=" pass
                    print "Environment=SMTP_FROM=" from
                    print "Environment=FRONTEND_URL=" url
                    next
                }
                { print }
            ' "$SERVICE_FILE" > "$TEMP_FILE"
            mv "$TEMP_FILE" "$SERVICE_FILE"
            
            echo "✅ Environment переменные добавлены в service file"
        else
            echo "⚠️  Секция [Service] не найдена в service file"
        fi
        
        # Перезагружаем systemd и перезапускаем сервис
        echo ""
        echo "=== Перезапуск сервиса ==="
        systemctl daemon-reload
        echo "✅ Systemd daemon перезагружен"
        
        systemctl restart "$SERVICE_NAME"
        echo "✅ Сервис перезапущен"
        
        sleep 3
        
        echo ""
        echo "=== Статус сервиса ==="
        systemctl status "$SERVICE_NAME" --no-pager | head -15 || true
        
        echo ""
        echo "=== Проверка новых настроек в логах ==="
        sleep 2
        journalctl -u "$SERVICE_NAME" -n 30 --no-pager | grep -E 'SMTP|📧' | tail -10 || echo "Пока нет логов SMTP"
        
        echo ""
        echo "✅ Настройка SMTP завершена!"
        echo ""
        echo "Проверьте логи для подтверждения:"
        echo "  journalctl -u $SERVICE_NAME -f"
    else
        echo "⚠️  Service file не найден: $SERVICE_FILE"
        echo "   Настройки добавлены только в .env"
    fi
else
    echo ""
    echo "⚠️  Переменные окружения SMTP не установлены"
    echo "   Для автоматической настройки установите:"
    echo "   - SMTP_HOST"
    echo "   - SMTP_USER"
    echo "   - SMTP_PASS"
    echo ""
    echo "   Или настройте вручную в .env файле"
fi

echo ""
echo "=== Готово ==="

