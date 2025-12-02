import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { initDatabase } from './server/db.mjs';
import pool from './server/db.mjs';
import authRouter from './server/routes/auth.mjs';
import uploadRouter from './server/routes/upload.mjs';
import statsRouter from './server/routes/stats.mjs';
import settingsRouter from './server/routes/settings.mjs';
import adminRouter from './server/routes/admin.mjs';
import { setupSocketHandlers } from './server/socket/index.mjs';
import { initTorSettings } from './server/services/tor.mjs';

// Загружаем .env всегда для локальной разработки
// В продакшене переменные должны быть установлены через systemd и будут иметь приоритет
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

// Инициализация Socket.IO
const io = new Server(server, {
  cors: {
    origin: [
      'https://aiternitas.ru',
      'http://localhost:3001',
      'http://localhost:5173'
    ],
    credentials: true,
    methods: ['GET', 'POST']
  },
  // Привязка к express-session
  cookie: {
    name: 'aiternitas.sid',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
});

// Socket.IO будет использовать сессию через middleware в scene.mjs

// Trust proxy для правильной работы за nginx
app.set('trust proxy', 1);

// CORS настройки для работы с cookies
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://aiternitas.ru',
    'http://localhost:3001',
    'http://localhost:5173'
  ];

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Настройка хранилища сессий в PostgreSQL
const PgSession = connectPgSimple(session);

// Сессии с постоянным хранилищем в PostgreSQL
// Определяем, работаем ли мы в production (HTTPS)
const isProduction = process.env.NODE_ENV === 'production' ||
  process.env.BASE_URL?.includes('https://') ||
  process.env.BASE_URL?.includes('aiternitas.ru');

// Настройка cookies для сессий
const cookieConfig = {
  secure: isProduction, // Требует HTTPS в production
  httpOnly: true,
  sameSite: isProduction ? 'none' : 'lax', // Для работы через HTTPS нужен 'none'
  maxAge: 30 * 24 * 60 * 60 * 1000 // 30 дней
};

// Если нужна работа на поддоменах, раскомментируйте следующую строку:
// if (isProduction) cookieConfig.domain = '.aiternitas.ru';

console.log('🔐 Настройки сессий:', {
  isProduction,
  NODE_ENV: process.env.NODE_ENV,
  BASE_URL: process.env.BASE_URL,
  cookieConfig
});

const sessionStore = new PgSession({
  pool: pool, // Используем существующий пул подключений
  tableName: 'session', // Имя таблицы для сессий
  createTableIfMissing: false, // Таблица создается через initDatabase
  pruneSessionInterval: 60, // Очистка устаревших сессий каждые 60 секунд
});

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'aiternitas-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  name: 'aiternitas.sid', // Имя cookie для сессии
  cookie: cookieConfig
}));

// API Routes (должны быть до статических файлов)
// Google OAuth still uses HTTP routes (OAuth2 requires redirects)
app.use('/api/auth', authRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/stats', statsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/admin', adminRouter);
// NOTE: /api/flowchart removed - all flowchart operations now via Socket.IO

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
  .then(async () => {
    // Initialize TOR settings from database
    await initTorSettings();
    // Setup Socket.IO handlers for auth and flowchart
    setupSocketHandlers(io, sessionStore);

    server.listen(PORT, HOST, () => {
      console.log(`✅ Aiternitas сервер запущен на порту ${PORT}`);
      console.log(`📱 Главная страница: http://localhost:${PORT}`);
      console.log(`🔌 Socket.IO готов к подключениям (auth + flowchart)`);
    });
  })
  .catch((error) => {
    console.error('❌ Ошибка запуска сервера:', error);
    process.exit(1);
  });
