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
import mailRouter from './routes/mail.mjs';
import emailsRouter from './routes/emails.mjs';
import messagesRouter from './routes/messages.mjs';

// socket
import { setupSceneHandlers } from './socket/scene.mjs';
import { setupSocketHandlers } from './socket/index.mjs';

// subsystems (migrated from monolith server.mjs)
import { startMailReceiver } from './mail/receiver.mjs';
import { startMonitoring, stopMonitoring, systemEvents } from './services/system_monitor.mjs';

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
app.use('/mail', mailRouter);
app.use('/emails', emailsRouter);
app.use('/messages', messagesRouter);

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
    await initRabbit('user');
    console.log('[DB] Connected');

    console.log('[RabbitMQ] Bootstrapping...');
    console.log(`[RabbitMQ] Queue: ${rabbit.queue}`);

    setupSocketHandlers(io, sessionStore);
    setupSceneHandlers(io, sessionStore);

    // --- Mail receiver (SMTP inbound) ---
    try {
      startMailReceiver(io);
    } catch (e) {
      console.error('[Mail] failed to start receiver:', e.message);
    }

    // --- System monitoring -> broadcast metrics ---
    startMonitoring(3000);
    systemEvents.on('metrics', (metrics) => {
      io.emit('system:metrics', metrics);
    });

    // --- Event bus -> Socket.IO bridge (consume user.# events) ---
    rabbit.consume((event, data) => {
      try {
        if (event === 'user.chat.message' && data?.userId) {
          io.to(`user:${data.userId}`).emit('sandbox:chat:response', data);
        } else if (event === 'user.task.updated' && data?.userId) {
          io.to(`user:${data.userId}`).emit('task:updated', data);
        } else if (event === 'user.telegram.message') {
          if (data?.userId) io.to(`user:${data.userId}`).emit('telegram:message', data);
          else io.emit('telegram:message', data);
        } else if (event === 'user.mail.new' && data?.userId) {
          io.to(`user:${data.userId}`).emit('mail:new', data);
        }
      } catch (e) {
        console.error('[RabbitMQ] bridge error:', e.message);
      }
    });

    server.listen(PORT, () => {
      console.log(`[UserServer] 🚀 Listening on port ${PORT}`);
    });

  } catch (err) {
    console.error('[Bootstrap ERROR]', err);
    process.exit(1);
  }
}

bootstrap();

//
// GRACEFUL SHUTDOWN
//
async function shutdown(signal) {
  console.log(`\n🛑 [UserServer] ${signal} - shutting down gracefully...`);
  try { stopMonitoring(); } catch (e) { console.error('[Shutdown] stopMonitoring:', e.message); }
  try { server.close(() => process.exit(0)); } catch (e) { process.exit(0); }
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));