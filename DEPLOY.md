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
| SMTP_*           | Нет         | По умолчанию отправка идёт через **localhost:25** (локальный Postfix). Задайте SMTP_HOST/SMTP_USER/SMTP_PASS только при использовании стороннего SMTP. |
| MAIL_DOMAIN      | Нет         | Домен почты (по умолчанию `aiternitas.ru`). Адреса ящиков: логин@MAIL_DOMAIN. |
| MAIL_PORT        | Нет         | Порт приёма входящей почты (по умолчанию 2525). Postfix передаёт письма для @aiternitas.ru на этот порт. |
| GOOGLE_CLIENT_*   | Нет         | Для входа через Google |

---

## Проверка после деплоя

```bash
sudo systemctl status aiternitas-main.service
sudo journalctl -u aiternitas-main.service -f
```

Сайт: https://aiternitas.ru

Если **502 Bad Gateway** — Nginx не получает ответ от приложения на порту 3001. Ниже чек-лист проверок на сервере.

---

## Устранение 502 Bad Gateway

Выполняйте на сервере (SSH в aiternitas.ru или где развёрнут проект).

### 1. Сервис запущен и не падает

```bash
sudo systemctl status aiternitas-main.service
```

- **active (running)** — процесс есть; переходите к шагу 2.
- **inactive** или **failed** — запустите и смотрите логи:
  ```bash
  sudo systemctl start aiternitas-main.service
  sudo journalctl -u aiternitas-main.service -n 100 --no-pager
  ```

### 2. Логи приложения

Часто сервер не доходит до `server.listen(3001)` из-за ошибки при старте (например, БД).

```bash
sudo journalctl -u aiternitas-main.service -n 80 --no-pager
```

Ищите:
- `❌ Ошибка запуска сервера:` — дальше будет причина (часто БД или переменные).
- `✅ Aiternitas сервер запущен на порту 3001` — приложение слушает порт; если 502 остаётся, смотрите шаг 3 и 4.

### 3. Переменные окружения и БД

Сервис должен подхватывать переменные из файла:

```bash
# Должна быть раскомментирована строка EnvironmentFile=...
sudo grep EnvironmentFile /etc/systemd/system/aiternitas-main.service
```

Если пусто — в `/etc/systemd/system/aiternitas-main.service` раскомментируйте:
`EnvironmentFile=/opt/aiternitas-main/.env.production`

Проверьте, что в `/opt/aiternitas-main/.env.production` заданы и корректны:
- `NODE_ENV=production`
- `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` (PostgreSQL доступен с сервера)
- `SESSION_SECRET` (любая длинная случайная строка)

После правок:
```bash
sudo systemctl daemon-reload
sudo systemctl restart aiternitas-main.service
```

### 4. Порт 3001 слушается

```bash
sudo ss -tlnp | grep 3001
# или
sudo lsof -i :3001
```

Должен быть процесс `node` (или `aiternitas-main`). Если порт не слушается — приложение не стартовало до `listen()` (снова смотрите логи из шага 2).

### 5. Nginx и upstream

Конфиг Nginx должен проксировать на `http://127.0.0.1:3001` (как в `nginx-main.conf`). Проверка:

```bash
sudo nginx -t
curl -I http://127.0.0.1:3001
```

Если `curl` к `127.0.0.1:3001` возвращает HTTP 200/301 и т.п., а в браузере по-прежнему 502 — проверьте `server_name` и то, что запрос идёт на тот же сервер, где крутится Nginx.

**Кратко:** в большинстве случаев 502 устраняется после проверки логов (`journalctl`), настройки `DB_*` и `EnvironmentFile` в systemd и перезапуска `aiternitas-main.service`.

---

## Почта (отправка и приём)

По умолчанию приложение отправляет письма через **localhost:25** (локальный Postfix). Настройте Postfix для приёма и отправки (см. **docs/MAIL_SERVER_SETUP.md** и **docs/MAIL_ARCHITECTURE.md**).

Если используете сторонний SMTP (Gmail и т.п.), проверьте:

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

5. **Письмо не приходит в Gmail (или не видно):**
   - Проверьте папку **«Спам»** в Gmail — письма подтверждения часто попадают туда.
   - Для отправки **через Gmail** в `.env.production` нужны: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=ваш@gmail.com`, `SMTP_PASS=пароль_приложения` (не обычный пароль). Пароль приложения: Google-аккаунт → Безопасность → Двухэтапная аутентификация → Пароли приложений.
   - Если после регистрации на сайте показывается «Причина: SMTP не настроен…» — на сервере не заданы `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` в `.env.production`; задайте их и перезапустите сервис.
   - Если письмо в логах уходит успешно (`Email успешно отправлен`), но в Gmail его нет — проверьте Спам и задержки доставки (иногда до минуты).
