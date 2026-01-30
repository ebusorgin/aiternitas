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
import emailsRouter from './server/routes/emails.mjs';
import mailRouter from './server/routes/mail.mjs';
import { setupSocketHandlers } from './server/socket/index.mjs';
import { startMailReceiver } from './server/mail/receiver.mjs';

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
// Default to production if on Linux or if NODE_ENV is explicitly production
const isProduction = process.env.NODE_ENV === 'production' || 
                     (process.platform === 'linux' && process.env.NODE_ENV !== 'development') ||
                     process.env.BASE_URL?.includes('https://') ||
                     process.env.BASE_URL?.includes('aiternitas.ru');

// Настройка cookies для сессий (SameSite=Lax достаточно для того же домена)
const cookieConfig = {
  secure: isProduction,
  httpOnly: true,
  sameSite: 'lax', // same-origin запросы — Lax надёжнее, None часто блокируется
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

// Секрет для подписи сессий. В production лучше задать SESSION_SECRET в окружении (systemd, .env).
const sessionSecret = process.env.SESSION_SECRET || 'aiternitas-secret-key-change-in-production';
if (isProduction && !process.env.SESSION_SECRET) {
  console.warn('⚠️  ВАЖНО: SESSION_SECRET не задан. Задайте переменную SESSION_SECRET на сервере для безопасности сессий. См. DEPLOY.md');
}

app.use(session({
  store: sessionStore,
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  name: 'aiternitas.sid',
  cookie: cookieConfig,
  proxy: true // учитывать X-Forwarded-Proto за nginx, иначе secure-cookie не ставится
}));

// API Routes (должны быть до статических файлов)
// Google OAuth still uses HTTP routes (OAuth2 requires redirects)
app.use('/api/auth', authRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/stats', statsRouter);
app.use('/api/emails', emailsRouter);
app.use('/api/mail', mailRouter);
// NOTE: /api/flowchart removed - all flowchart operations now via Socket.IO

// Статические файлы из собранного React приложения
const distPath = path.join(__dirname, 'dist');
const uploadsPath = path.join(__dirname, 'uploads');

// Раздаем статические файлы из dist (index.html без кеша — чтобы браузер всегда подхватывал новый бандл)
app.use(express.static(distPath, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    }
  }
}));
app.use('/uploads', express.static(uploadsPath));

// SPA роутинг: все маршруты возвращают index.html
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Инициализация БД и запуск сервера
initDatabase()
  .then(() => {
    setupSocketHandlers(io, sessionStore);
    startMailReceiver(io);
    
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
