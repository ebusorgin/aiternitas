import './config.mjs';
import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import cors from 'cors';
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

// socket-обработчики теперь живут за RabbitMQ-шиной (SocketAdapter)
import { createBusSocketHandlers } from './socket/bus.mjs';

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
    // user-сервис потребляет свои команды (user.#) и RPC-ответы (reply.user)
    await initRabbit('user', { bindings: ['reply.user'] });
    console.log('[DB] Connected');

    console.log('[RabbitMQ] Bootstrapping...');
    console.log(`[RabbitMQ] Queue: ${rabbit.queue}`);

    // Socket-обработчики подключены к шине через SocketAdapter
    const { adapter, handle } = createBusSocketHandlers(sessionStore);
    await rabbit.consume(handle);

    // --- Mail receiver (SMTP inbound) ---
    try {
      // receiver использует только io.to(room).emit -> publish push в шину,
      // доставка клиентам через socketServer-гейт
      startMailReceiver(adapter.ioShim());
    } catch (e) {
      console.error('[Mail] failed to start receiver:', e.message);
    }

    // --- System monitoring -> broadcast metrics ---
    startMonitoring(3000);
    systemEvents.on('metrics', (metrics) => {
      rabbit.publish('push.all', { event: 'system:metrics', data: metrics });
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