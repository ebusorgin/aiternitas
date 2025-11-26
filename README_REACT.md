# Aiternitas.ru - React приложение

Проект переведен на React с использованием Vite для сборки.

## Структура проекта

```
aiternitas.ru/
├── src/                    # Исходный код React приложения
│   ├── components/         # React компоненты
│   │   ├── Layout.jsx      # Основной layout с сайдбаром
│   │   ├── Sidebar.jsx     # Боковое меню
│   │   └── ProtectedRoute.jsx  # Защищенный маршрут
│   ├── pages/              # Страницы приложения
│   │   ├── Home.jsx        # Главная страница
│   │   ├── Login.jsx       # Страница входа
│   │   ├── Register.jsx    # Страница регистрации
│   │   └── Profile.jsx    # Личный кабинет
│   ├── context/            # React контексты
│   │   └── AuthContext.jsx # Контекст авторизации
│   ├── App.jsx             # Главный компонент приложения
│   ├── main.jsx            # Точка входа
│   └── index.css           # Глобальные стили
├── server/                  # Backend сервер (Express)
├── dist/                    # Собранное приложение (генерируется)
└── public/                  # Статические файлы

```

## Разработка

### Установка зависимостей
```bash
npm install
```

### Запуск в режиме разработки
```bash
# Терминал 1: Backend сервер
npm run start:dev

# Терминал 2: Frontend (Vite dev server)
npm run dev
```

Frontend будет доступен на `http://localhost:3000`
Backend API будет доступен на `http://localhost:3001`

Vite автоматически проксирует запросы `/api/*` на backend сервер.

## Production сборка

### Сборка React приложения
```bash
npm run build
```

Это создаст оптимизированную сборку в папке `dist/`.

### Запуск production сервера
```bash
NODE_ENV=production npm start
```

Сервер автоматически определит наличие папки `dist/` и будет раздавать React приложение.

## Деплой

1. Соберите проект: `npm run build`
2. Запушьте изменения в репозиторий
3. На сервере выполните:
   ```bash
   cd /opt/aiternitas-main
   git pull origin production
   npm install
   npm run build
   systemctl restart aiternitas-main.service
   ```

## Особенности

- **React Router** для клиентской маршрутизации
- **Context API** для управления состоянием авторизации
- **Vite** для быстрой сборки и HMR в разработке
- **PostgreSQL Session Store** для постоянного хранения сессий
- **Защищенные маршруты** для страниц, требующих авторизации
- **Адаптивный дизайн** с мобильным меню

## Миграция со старого кода

Старые HTML файлы (`index.html`, `login.html`, `register.html`, `profile.html`) остаются для обратной совместимости в режиме разработки. В production используется React приложение из `dist/`.

