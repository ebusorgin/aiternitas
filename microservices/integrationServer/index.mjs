import './config.mjs';

import express from 'express';
import cors from 'cors';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';

import pool, { initDatabase } from './db.mjs';
import telegramRouter from './routes/telegram.mjs';
import pluginsRouter from './routes/plugins.mjs';
import telegramConnectionManager from './plugins/telegramConnectionManager.mjs';
import rabbit, { initRabbit } from '../_serviceLib/rabbitmq.mjs';

const PORT = parseInt(process.env.INTEGRATION_PORT || '4007', 10);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: [FRONTEND_URL, 'http://localhost:3001'], credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

//
// SESSION — shared with userServer via the same Postgres `session` table and
// secret, so `requireAuth` (req.session.userId) works for proxied requests.
//
const PgSession = connectPgSimple(session);
const sessionStore = new PgSession({
  pool,
  tableName: 'session',
  createTableIfMissing: false,
});

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false,
  name: 'aiternitas.sid',
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  },
  proxy: true,
}));

//
// ROUTES
//
app.use('/telegram', telegramRouter);
app.use('/plugins', pluginsRouter);

app.get('/', (req, res) => res.send('integrationServer is running on port ' + PORT));

//
// BOOTSTRAP
//
async function bootstrap() {
  try {
    console.log('[integrationServer] Starting...');

    await initDatabase();
    await initRabbit('integration');

    // Incoming Telegram messages -> event bus -> userServer relays to sockets.
    telegramConnectionManager.setMessageHandler((message, connectionInfo) => {
      rabbit.publish('user.telegram.message', {
        userId: connectionInfo?.userId,
        projectId: connectionInfo?.projectId,
        elementId: connectionInfo?.elementId,
        pluginId: connectionInfo?.pluginId,
        message,
      }).catch((e) => console.error('[integrationServer] publish telegram error:', e.message));
    });

    // Restore persistent Telegram connections for enabled account-mode plugins.
    try {
      await telegramConnectionManager.loadAndConnectAll();
    } catch (e) {
      console.error('[integrationServer] loadAndConnectAll failed:', e.message);
    }

    app.listen(PORT, () => {
      console.log(`[integrationServer] 🚀 Listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('[integrationServer] BOOTSTRAP ERROR', err);
    process.exit(1);
  }
}

bootstrap();

//
// GRACEFUL SHUTDOWN
//
async function shutdown(signal) {
  console.log(`\n🛑 [integrationServer] ${signal} - shutting down gracefully...`);
  try { await telegramConnectionManager.disconnectAll(); } catch (e) { console.error('[Shutdown] disconnectAll:', e.message); }
  try { await rabbit.close(); } catch (_) {}
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
