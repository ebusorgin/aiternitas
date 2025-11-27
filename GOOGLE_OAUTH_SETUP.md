# Настройка Google OAuth

## Шаги настройки

### 1. Создание OAuth 2.0 Client ID в Google Cloud Console

1. Перейдите в [Google Cloud Console](https://console.cloud.google.com/)
2. Создайте новый проект или выберите существующий
3. Перейдите в **APIs & Services** → **Credentials**
4. Нажмите **Create Credentials** → **OAuth client ID**
5. Если это первый раз, настройте OAuth consent screen:
   - Выберите **External** (для тестирования) или **Internal** (для G Suite)
   - Заполните обязательные поля (App name, User support email, Developer contact)
   - Добавьте scopes: `email`, `profile`
   - Сохраните и продолжите

6. Создайте OAuth Client ID:
   - Application type: **Web application**
   - Name: `Aiternitas`
   - Authorized JavaScript origins:
     - `http://localhost:3001` (для разработки)
     - `https://aiternitas.ru` (для продакшена)
   - Authorized redirect URIs:
     - `http://localhost:3001/api/auth/google/callback` (для разработки)
     - `https://aiternitas.ru/api/auth/google/callback` (для продакшена)

7. Скопируйте **Client ID** и **Client Secret**

### 2. Настройка переменных окружения

Добавьте в `.env` файл (или в переменные окружения на сервере):

```env
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=https://aiternitas.ru/api/auth/google/callback
FRONTEND_URL=https://aiternitas.ru
BASE_URL=https://aiternitas.ru
```

Для локальной разработки:
```env
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/google/callback
FRONTEND_URL=http://localhost:3001
BASE_URL=http://localhost:3001
```

### 3. Настройка на сервере

Если используете systemd, добавьте переменные окружения в файл сервиса `/etc/systemd/system/aiternitas-main.service`:

```ini
[Service]
Environment="GOOGLE_CLIENT_ID=your_client_id"
Environment="GOOGLE_CLIENT_SECRET=your_client_secret"
Environment="GOOGLE_REDIRECT_URI=https://aiternitas.ru/api/auth/google/callback"
Environment="FRONTEND_URL=https://aiternitas.ru"
Environment="BASE_URL=https://aiternitas.ru"
```

После изменения перезагрузите конфигурацию:
```bash
sudo systemctl daemon-reload
sudo systemctl restart aiternitas-main.service
```

### 4. Обновление базы данных

База данных автоматически обновится при первом запуске сервера. Колонка `google_id` будет добавлена в таблицу `users`.

## Как это работает

1. Пользователь нажимает "Войти через Google"
2. Перенаправляется на страницу авторизации Google
3. После успешной авторизации Google перенаправляет на `/api/auth/google/callback`
4. Сервер получает код авторизации и обменивает его на токен
5. Получает информацию о пользователе (email, name, picture)
6. Создает или обновляет пользователя в базе данных
7. Создает сессию и перенаправляет на `/profile`

## Безопасность

- Client Secret должен храниться только на сервере
- Используйте HTTPS в продакшене
- Настройте правильные redirect URIs для предотвращения атак
- Регулярно обновляйте зависимости

