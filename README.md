# Aiternitas - Главная страница

Платформа инновационных проектов с системой регистрации и авторизации.

## Возможности

- ✅ Регистрация пользователей (имя, email, пароль)
- ✅ Авторизация
- ✅ Личный кабинет
- ✅ Редактирование имени
- ✅ Загрузка аватара

## Установка

1. Установите зависимости:
```bash
npm install
```

2. Настройте базу данных PostgreSQL:
   - Убедитесь, что PostgreSQL запущен на `127.127.126.56:5432`
   - Создайте файл `.env` из `.env.example`:
   ```bash
   cp .env.example .env
   ```

3. Запустите сервер:
```bash
npm start
```

Сервер будет доступен на `http://localhost:3001`

## Структура проекта

```
aiternitas.ru/
├── server/
│   ├── db.mjs              # Подключение к PostgreSQL
│   ├── middleware/
│   │   └── auth.mjs       # Middleware авторизации
│   └── routes/
│       ├── auth.mjs       # API регистрации/авторизации
│       └── upload.mjs     # API загрузки аватара
├── styles/
│   ├── auth.css          # Стили для регистрации/входа
│   └── profile.css       # Стили для личного кабинета
├── js/
│   ├── main.js           # Главная страница
│   ├── auth.js           # Регистрация/авторизация
│   └── profile.js        # Личный кабинет
├── uploads/
│   └── avatars/          # Загруженные аватары
├── index.html            # Главная страница
├── register.html         # Страница регистрации
├── login.html            # Страница входа
├── profile.html          # Личный кабинет
└── server.mjs           # Express сервер
```

## API Endpoints

### Авторизация
- `POST /api/auth/register` - Регистрация
- `POST /api/auth/login` - Вход
- `POST /api/auth/logout` - Выход
- `GET /api/auth/me` - Получить текущего пользователя
- `PUT /api/auth/profile/name` - Обновить имя

### Загрузка файлов
- `POST /api/upload/avatar` - Загрузить аватар

## Использование

1. Откройте `http://localhost:3001`
2. Нажмите "Регистрация"
3. Заполните форму (имя, email, пароль)
4. После регистрации вы автоматически войдете в систему
5. Перейдите в "Личный кабинет" для редактирования имени и загрузки аватара

## База данных

При первом запуске автоматически создается:
- База данных `aiternitas` (если не существует)
- Таблица `users` с полями:
  - id (SERIAL PRIMARY KEY)
  - name (VARCHAR)
  - email (VARCHAR UNIQUE)
  - password (VARCHAR - хешированный)
  - avatar (VARCHAR - путь к файлу)
  - created_at (TIMESTAMP)
  - updated_at (TIMESTAMP)
