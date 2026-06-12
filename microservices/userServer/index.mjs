import './config.mjs';
import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import cors from 'cors';
import { Server } from 'socket.io';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

import pool, { initDatabase } from './db.mjs';

// routes
import authRouter from './routes/auth.mjs';
import uploadRouter from './routes/upload.mjs';
import statsRouter from './routes/stats.mjs';
import pluginsRouter from './routes/plugins.mjs';
import mailRouter from './routes/mail.mjs';
import emailsRouter from './routes/emails.mjs';
import messagesRouter from './routes/messages.mjs';
import telegramRouter from './routes/telegram.mjs';

// socket
import { setupSceneHandlers } from './socket/scene.mjs';
import { setupSocketHandlers } from './socket/index.mjs';

import rabbit, { initRabbit } from '../_serviceLib/rabbitmq.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 4002;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';



app.set('trust proxy', 1);

app.use(cors({
  origin: [FRONTEND_URL, 'http://localhost:3001'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//
// SESSION
//
const PgSession = connectPgSimple(session);

const sessionStore = new PgSession({
  pool,
  tableName: 'session',
  createTableIfMissing: false,
});

const sessionMiddleware = session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false,
  name: 'aiternitas.sid',
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000
  },
  proxy: true
});

app.use(sessionMiddleware);

//
// SOCKET.IO
//
const io = new Server(server, {
  cors: {
    origin: [FRONTEND_URL, 'http://localhost:3000'],
    methods: ["GET", "POST"],
    credentials: true
  },
  pingInterval: 25000,
  pingTimeout: 20000
});

io.engine.use(sessionMiddleware);

//
// ROUTES
//
app.use('/auth', authRouter);
app.use('/upload', uploadRouter);
app.use('/stats', statsRouter);
app.use('/plugins', pluginsRouter);
app.use('/mail', mailRouter);
app.use('/emails', emailsRouter);
app.use('/messages', messagesRouter);
app.use('/telegram', telegramRouter);

//
// STATIC
//
const uploadsPath = path.join(__dirname, '..', '..', 'uploads');
app.use('/uploads', express.static(uploadsPath));

app.get('/', (req, res) => {
  res.send('userServer is running on port ' + PORT);
});

//
// BOOTSTRAP
//
async function bootstrap() {
  try {
    console.log('[System] Starting...');

    await initDatabase();
    await initRabbit(process.env.RABBITMQ_QUEUE);
    console.log('[DB] Connected');

    console.log('[RabbitMQ] Bootstrapping...');
    console.log(`[RabbitMQ] Queue: ${rabbit.queue}`);

    setupSocketHandlers(io, sessionStore);
    setupSceneHandlers(io, sessionStore);

    server.listen(PORT, () => {
      console.log(`[UserServer] 🚀 Listening on port ${PORT}`);
    });

  } catch (err) {
    console.error('[Bootstrap ERROR]', err);
    process.exit(1);
  }
}

bootstrap();