# Автоматическая настройка SMTP

## Быстрый способ через GitHub Actions

1. Перейдите в GitHub → Actions → "Setup SMTP Configuration"
2. Нажмите "Run workflow"
3. Выберите действие:
   - **check** - проверить текущие настройки SMTP
   - **setup** - настроить SMTP (нужны данные)
   - **test** - протестировать SMTP после настройки

## Настройка через GitHub Secrets (рекомендуется)

Добавьте в GitHub Secrets (Settings → Secrets and variables → Actions):

- `SMTP_HOST` - например, `smtp.gmail.com`
- `SMTP_PORT` - например, `587`
- `SMTP_USER` - ваш email
- `SMTP_PASS` - пароль приложения (для Gmail)
- `SMTP_FROM` - адрес отправителя (опционально)
- `FRONTEND_URL` - `https://aiternitas.ru`

После добавления secrets, запустите workflow "Setup SMTP Configuration" с действием **setup**.

## Настройка вручную на сервере

Если у вас есть прямой доступ к серверу:

```bash
cd /opt/aiternitas-main

# Добавьте в .env файл:
cat >> .env << EOF
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@aiternitas.ru
FRONTEND_URL=https://aiternitas.ru
EOF

# Обновите systemd service
sudo systemctl edit aiternitas-main.service
# Добавьте:
[Service]
Environment="SMTP_HOST=smtp.gmail.com"
Environment="SMTP_PORT=587"
Environment="SMTP_USER=your-email@gmail.com"
Environment="SMTP_PASS=your-app-password"
Environment="SMTP_FROM=noreply@aiternitas.ru"
Environment="FRONTEND_URL=https://aiternitas.ru"

# Перезапустите сервис
sudo systemctl daemon-reload
sudo systemctl restart aiternitas-main.service
```

## Бесплатные SMTP сервисы для тестирования

### Mailtrap (для тестирования)
- Регистрация: https://mailtrap.io
- SMTP_HOST: `smtp.mailtrap.io`
- SMTP_PORT: `2525`
- SMTP_USER: ваш username из Mailtrap
- SMTP_PASS: ваш password из Mailtrap

### Gmail
- SMTP_HOST: `smtp.gmail.com`
- SMTP_PORT: `587`
- SMTP_USER: ваш gmail адрес
- SMTP_PASS: пароль приложения (не обычный пароль!)
  - Как получить: https://myaccount.google.com/apppasswords

### Mail.ru
- SMTP_HOST: `smtp.mail.ru`
- SMTP_PORT: `465`
- SMTP_USER: ваш email@mail.ru
- SMTP_PASS: ваш пароль

## Проверка работы

После настройки:

1. Зарегистрируйте нового пользователя
2. Проверьте логи: `journalctl -u aiternitas-main.service -f`
3. Должны увидеть: `✅ Email успешно отправлен`

Если видите ошибки, проверьте:
- Правильность учетных данных
- Открыт ли порт на сервере (587 или 465)
- Для Gmail: используется ли пароль приложения

