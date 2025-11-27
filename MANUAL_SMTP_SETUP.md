# Ручная настройка SMTP на сервере

## Подключение к серверу

```bash
ssh root@aiternitas.ru
# или
ssh root@82.146.44.126
```

## Настройка SMTP

После подключения к серверу выполните:

```bash
cd /opt/aiternitas-main

# 1. Создайте backup .env
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# 2. Обновите .env файл
nano .env
# или
vi .env
```

Добавьте в конец файла `.env`:

```env
# SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@aiternitas.ru
FRONTEND_URL=https://aiternitas.ru
```

Сохраните файл (в nano: Ctrl+O, Enter, Ctrl+X)

## Обновление systemd service

```bash
# 1. Создайте backup
cp /etc/systemd/system/aiternitas-main.service /etc/systemd/system/aiternitas-main.service.backup.$(date +%Y%m%d_%H%M%S)

# 2. Отредактируйте service file
nano /etc/systemd/system/aiternitas-main.service
```

Найдите секцию `[Service]` и добавьте после неё (замените значения на ваши):

```ini
[Service]
Environment=SMTP_HOST=smtp.gmail.com
Environment=SMTP_PORT=587
Environment=SMTP_USER=your-email@gmail.com
Environment=SMTP_PASS=your-app-password
Environment=SMTP_FROM=noreply@aiternitas.ru
Environment=FRONTEND_URL=https://aiternitas.ru
```

Сохраните файл.

## Перезапуск сервиса

```bash
# Перезагрузите systemd
systemctl daemon-reload

# Перезапустите сервис
systemctl restart aiternitas-main.service

# Проверьте статус
systemctl status aiternitas-main.service

# Проверьте логи
journalctl -u aiternitas-main.service -f
```

В логах вы должны увидеть:
- `📧 Проверка настроек SMTP:` - показывает настройки
- `✅ Email успешно отправлен` - если письмо отправлено

## Проверка работы

1. Зарегистрируйте нового пользователя на сайте
2. Проверьте логи: `journalctl -u aiternitas-main.service -n 50 | grep SMTP`
3. Проверьте почту на наличие письма с подтверждением

## Примеры SMTP настроек

### Gmail
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password  # Пароль приложения, не обычный пароль!
```

### Mail.ru
```env
SMTP_HOST=smtp.mail.ru
SMTP_PORT=465
SMTP_USER=your-email@mail.ru
SMTP_PASS=your-password
```

### Yandex
```env
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_USER=your-email@yandex.ru
SMTP_PASS=your-password
```

