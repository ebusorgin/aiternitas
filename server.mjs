import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import dotenv from 'dotenv';
import { initDatabase } from './server/db.mjs';
import authRouter from './server/routes/auth.mjs';
import uploadRouter from './server/routes/upload.mjs';
import statsRouter from './server/routes/stats.mjs';

// Загружаем .env только если переменные не установлены извне (например, из systemd)
// В продакшене переменные должны быть установлены через systemd
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Сессии
app.use(session({
  secret: process.env.SESSION_SECRET || 'aiternitas-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 дней
  }
}));

// Статические файлы
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/stats', statsRouter);

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Страница регистрации
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'register.html'));
});

// Страница входа
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Личный кабинет
app.get('/profile', (req, res) => {
  res.sendFile(path.join(__dirname, 'profile.html'));
});

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Инициализация БД и запуск сервера
initDatabase()
  .then(() => {
    server.listen(PORT, HOST, () => {
      console.log(`✅ Aiternitas сервер запущен на порту ${PORT}`);
      console.log(`📱 Главная страница: http://localhost:${PORT}`);
      console.log(`🔐 Регистрация: http://localhost:${PORT}/register`);
      console.log(`👤 Личный кабинет: http://localhost:${PORT}/profile`);
    });
  })
  .catch((error) => {
    console.error('❌ Ошибка запуска сервера:', error);
    process.exit(1);
  });
