// socketServer — Socket.IO-гейт Aiternitas.
// Единственные обязанности:
//   1. держать веб-сокетные соединения (авторизованные/неавторизованные);
//   2. проверять HTTP-сессию (PostgreSQL) при подключении и на auth:check;
//   3. неавторизованным на защищённые события — отдавать ошибку;
//   4. все клиентские сообщения гнать в RabbitMQ, все рассылки из шины — клиентам.
// Бизнес-логики здесь нет и быть не должно.

import './config.mjs';

import http from 'http';
import { Server } from 'socket.io';
import pool from './db.mjs';
import { initRabbit } from '../_serviceLib/rabbitmq.mjs';
import { verifySession } from './session.mjs';
import { initBridge, dispatch } from './bridge.mjs';
import { PUBLIC_EVENTS, LOCAL_EVENTS } from './registry.mjs';

const PORT = process.env.PORT || 4009;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'socketServer' }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(server, {
  cors: {
    origin: [FRONTEND_URL, 'http://localhost:3000', 'http://localhost:3001'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingInterval: 25000,
  pingTimeout: 20000
});

// Middleware: восстановить сессию из cookie (соединение остаётся в любом случае,
// но все protected-события для анонима получают UNAUTHORIZED).
io.use(async (socket, next) => {
  try {
    const session = await verifySession(socket);
    if (session) {
      socket.userId = session.userId;
      socket.userName = session.name;
      socket.userEmail = session.email;
      socket.httpSessionId = session.sid;
      console.log(`✅ [SocketGate] session restored: ${session.email} (id: ${session.userId})`);
    }
  } catch (e) {
    console.error('[SocketGate] session middleware error:', e.message);
  }
  next();
});

io.on('connection', (socket) => {
  console.log(`🔌 [SocketGate] connected: ${socket.id} (user: ${socket.userId || 'anonymous'})`);

  if (socket.userId) {
    socket.join(`user:${socket.userId}`);
  } else {
    socket.emit('auth:error', { error: 'UNAUTHORIZED', message: 'Пользователь не авторизован' });
  }

  // --- локальные события гейта ---
  socket.on('ping', (data, callback) => {
    const responder = typeof data === 'function' ? data : callback;
    responder?.({ pong: true, timestamp: Date.now() });
  });

  socket.on('status', (data, callback) => {
    const responder = typeof data === 'function' ? data : callback;
    responder?.({
      connected: true,
      authenticated: !!socket.userId,
      userId: socket.userId || null,
      userName: socket.userName || null,
      socketId: socket.id
    });
  });

  socket.on('auth:check', async (data, callback) => {
    const responder = typeof data === 'function' ? data : callback;
    try {
      if (!socket.userId) {
        // перепроверяем: cookie мог появиться после логина без перезагрузки сокета
        const session = await verifySession(socket);
        if (session) {
          socket.userId = session.userId;
          socket.userName = session.name;
          socket.userEmail = session.email;
          socket.join(`user:${socket.userId}`);
        }
      }

      if (socket.userId) {
        responder?.({ authenticated: true, user: { id: socket.userId, name: socket.userName, email: socket.userEmail } });
      } else {
        responder?.({ authenticated: false });
      }
    } catch (e) {
      console.error('[SocketGate] auth:check error:', e.message);
      responder?.({ authenticated: false, error: 'Ошибка проверки авторизации' });
    }
  });

  // --- универсальный мост в шину для всех остальных событий ---
  // (Socket.IO вызывает зарегистрированный обработчик с (data, ack), ack === undefined
  //  если клиент не ждёт ответа)
  const onAny = (event, data, ack) => {
    if (LOCAL_EVENTS.has(event)) return; // ping/status разобраны выше
    if (event === 'auth:check') return;
    if (event === 'disconnect' || event === 'error') return;

    if (!socket.userId && !PUBLIC_EVENTS.has(event)) {
      if (typeof ack === 'function') {
        ack({ error: 'UNAUTHORIZED', success: false });
      }
      return;
    }

    dispatch(socket, event, data, ack).catch((e) => {
      console.error(`[SocketGate] dispatch '${event}' failed:`, e.message);
      if (typeof ack === 'function') ack({ error: `DISPATCH_FAILED: ${e.message}` });
    });
  };

  socket.onAny((event, ...args) => {
    // ack — последняя функция в args, если клиент её передал
    const ackIndex = args.findIndex((a) => typeof a === 'function');
    const ack = ackIndex >= 0 ? args[ackIndex] : undefined;
    const data = ackIndex >= 0 ? args.slice(0, ackIndex) : args;
    onAny(event, data.length <= 1 ? data[0] : data, ack);
  });

  socket.on('disconnect', (reason) => {
    console.log(`🔌 [SocketGate] disconnected: ${socket.id} (user: ${socket.userId || 'anonymous'}, reason: ${reason})`);
  });
});

async function bootstrap() {
  try {
    console.log('[SocketGate] Starting...');

    await pool.query('SELECT 1');
    console.log('[DB] Connected');

    // гейт слушает: socket.# (свои), reply.# (RPC-ответы сервисов),
    // push.# (доставка клиент-событий от шеймов), system.# и user.# (рассылки, legacy-мост)
    const rabbit = await initRabbit('socket', {
      bindings: ['reply.#', 'push.#', 'system.#', 'user.#']
    });

    await rabbit.consume(initBridge(io));

    server.listen(PORT, () => {
      console.log(`[SocketGate] 🚀 Listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('[SocketGate Bootstrap ERROR]', err);
    process.exit(1);
  }
}

bootstrap();

async function shutdown(signal) {
  console.log(`\n🛑 [SocketGate] ${signal} - shutting down...`);
  try { io.close(); } catch (e) {}
  try { server.close(() => process.exit(0)); } catch (e) { process.exit(0); }
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
