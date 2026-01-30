# Развёртывание на production (aiternitas.ru)

## Автоматическая настройка при первом деплое

При первом запуске **деплой сам всё настраивает**:

- **Локальный деплой**: выполните `./deploy-local-build.sh` (или `bash deploy-local-build.sh`).
- **Деплой через GitHub**: сделайте пуш в ветку `production` — workflow развернёт код и запустит на сервере `scripts/setup-server.sh`.

Скрипт `scripts/setup-server.sh` на сервере:

1. Создаёт `.env.production` из примера (если файла ещё нет) и подставляет сгенерированный `SESSION_SECRET`.
2. Устанавливает systemd-сервис `aiternitas-main.service` (если ещё не установлен) и включает загрузку переменных из `.env.production`.
3. Ставит зависимости (`npm install --omit=dev`) и перезапускает сервис.

После первого деплоя **при необходимости** отредактируйте на сервере `/opt/aiternitas-main/.env.production`: укажите `DB_PASSWORD` и при необходимости `SMTP_*`, `GOOGLE_CLIENT_*`. Затем выполните `sudo systemctl restart aiternitas-main.service`.

---

## Ручная настройка (если нужно сделать всё вручную)

### 1. Запустить скрипт настройки на сервере

После того как код уже на сервере:

```bash
cd /opt/aiternitas-main
chmod +x scripts/setup-server.sh
bash scripts/setup-server.sh
```

### 2. Или по шагам

- Скопировать `scripts/env.production.example` в `.env.production`, сгенерировать SESSION_SECRET: `node scripts/generate-session-secret.mjs`.
- Скопировать `scripts/aiternitas-main.service.example` в `/etc/systemd/system/aiternitas-main.service`, раскомментировать строку `EnvironmentFile=/opt/aiternitas-main/.env.production`, выполнить `systemctl daemon-reload && systemctl enable aiternitas-main.service && systemctl start aiternitas-main.service`.
- Проверить nginx: проксирование на `http://127.0.0.1:3001`. Пример конфига — `nginx-main.conf`.

---

## Переменные окружения (кратко)

| Переменная       | Обязательно | Описание |
|------------------|-------------|----------|
| SESSION_SECRET  | Да          | Секрет для cookie сессий. Сгенерировать: `node scripts/generate-session-secret.mjs` |
| NODE_ENV         | Да          | `production` |
| DB_HOST, DB_NAME, DB_USER, DB_PASSWORD | Да | Подключение к PostgreSQL |
| FRONTEND_URL     | Рекомендуется | `https://aiternitas.ru` |
| BASE_URL         | Рекомендуется | `https://aiternitas.ru` |
| PORT             | Нет         | По умолчанию 3001 |
| SMTP_*           | Нет         | Для отправки писем (верификация, сброс пароля) |
| MAIL_PORT        | Нет         | Порт приёма входящей почты (по умолчанию 2525). Все входящие сохраняются в БД. |
| GOOGLE_CLIENT_*   | Нет         | Для входа через Google |

---

## Проверка после деплоя

```bash
sudo systemctl status aiternitas-main.service
sudo journalctl -u aiternitas-main.service -f
```

Сайт: https://aiternitas.ru

Если 502 Bad Gateway — смотрите логи (`journalctl`). Частые причины: приложение не стартует (ошибка БД, неверные переменные) или nginx не может достучаться до порта приложения.

---

## Почта не приходит (подтверждение email, сброс пароля)

Письма отправляются только если на сервере настроен SMTP. Проверьте:

1. **В `.env.production` заданы переменные:**
   - `SMTP_HOST` — хост SMTP (например `smtp.gmail.com`, `smtp.yandex.ru`, `smtp.mail.ru`).
   - `SMTP_PORT` — обычно 587 (TLS) или 465 (SSL).
   - `SMTP_USER` — логин (часто полный email).
   - `SMTP_PASS` — пароль. Для Gmail нужен **пароль приложения** (не обычный пароль): Google-аккаунт → Безопасность → Двухэтапная аутентификация → Пароли приложений.
   - `SMTP_FROM` — адрес отправителя (по умолчанию берётся из SMTP_USER или `noreply@aiternitas.ru`).

2. **После изменений перезапустите сервис:**
   ```bash
   sudo systemctl restart aiternitas-main.service
   ```

3. **Проверка в логах:** при попытке отправить письмо в логах будет строка вида:
   - `SMTP_HOST не установлен` — SMTP не настроен.
   - `Ошибка отправки email:` и текст ошибки — неверный хост/порт/логин/пароль или блокировка порта.

4. **Таблица `emails` в БД:** приложение пишет туда каждую попытку отправки (статус `delivered` или `failed`, при ошибке — `error_message`). Можно проверить: `SELECT recipient, status, error_message, created_at FROM emails ORDER BY created_at DESC LIMIT 10;`
