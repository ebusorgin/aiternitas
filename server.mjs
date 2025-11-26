import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import dotenv from 'dotenv';
import { initDatabase } from './server/db.mjs';
import pool from './server/db.mjs';
import authRouter from './server/routes/auth.mjs';
import uploadRouter from './server/routes/upload.mjs';
import statsRouter from './server/routes/stats.mjs';

// Загружаем .env всегда для локальной разработки
// В продакшене переменные должны быть установлены через systemd и будут иметь приоритет
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

// Trust proxy для правильной работы за nginx
app.set('trust proxy', 1);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Настройка хранилища сессий в PostgreSQL
const PgSession = connectPgSimple(session);

// Сессии с постоянным хранилищем в PostgreSQL
app.use(session({
  store: new PgSession({
    pool: pool, // Используем существующий пул подключений
    tableName: 'session', // Имя таблицы для сессий
    createTableIfMissing: false, // Таблица создается через initDatabase
    pruneSessionInterval: 60, // Очистка устаревших сессий каждые 60 секунд
  }),
  secret: process.env.SESSION_SECRET || 'aiternitas-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Требует HTTPS в production
    httpOnly: true,
    sameSite: 'lax', // Защита от CSRF
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 дней
  }
}));

// API Routes (должны быть до статических файлов)
app.use('/api/auth', authRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/stats', statsRouter);

// Статические файлы из собранного React приложения
const distPath = path.join(__dirname, 'dist');
const uploadsPath = path.join(__dirname, 'uploads');

// Раздаем статические файлы из dist
app.use(express.static(distPath));
app.use('/uploads', express.static(uploadsPath));

// SPA роутинг: все маршруты возвращают index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Инициализация БД и запуск сервера
initDatabase()
  .then(() => {
    server.listen(PORT, HOST, () => {
      console.log(`✅ Aiternitas сервер запущен на порту ${PORT}`);
      console.log(`📱 Главная страница: http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('❌ Ошибка запуска сервера:', error);
    process.exit(1);
  });
