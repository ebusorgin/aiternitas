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
| SMTP_*           | Нет         | Для писем (верификация, сброс пароля) |
| GOOGLE_CLIENT_*   | Нет         | Для входа через Google |

---

## Проверка после деплоя

```bash
sudo systemctl status aiternitas-main.service
sudo journalctl -u aiternitas-main.service -f
```

Сайт: https://aiternitas.ru

Если 502 Bad Gateway — смотрите логи (`journalctl`). Частые причины: приложение не стартует (ошибка БД, неверные переменные) или nginx не может достучаться до порта приложения.
