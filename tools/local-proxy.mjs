#!/usr/bin/env node
/*
 * aiternitas.local — прозрачный TCP-форвардер (реверс-прокси) для локальной разработки.
 *
 * Слушает :80 на 127.0.0.1 и «сыро» пробрасывает весь трафик на Vite-девин-сервер
 * (localhost:3000). Работает на уровне TCP, поэтому одинаково прозрачен для
 * HTTP, HMR и WebSocket (Socket.IO), а заголовок Host: aiternitas.local сохраняется
 * без изменений. Никаких внешних зависимостей — только встроенный модуль `node:net`.
 *
 * Требует: в %SystemRoot%\System32\drivers\etc\hosts строка  "127.0.0.1  aiternitas.local"
 * Запуск:  node tools/local-proxy.mjs   (порт 80 → нужны права администратора)
 */
import net from 'node:net';

const LISTEN_PORT = parseInt(process.env.PROXY_PORT || '80', 10);
const HOST = process.env.PROXY_HOST || '127.0.0.1';
const TARGET_HOST = process.env.TARGET_HOST || '127.0.0.1';
const TARGET_PORT = parseInt(process.env.TARGET_PORT || '3000', 10);

const sockets = new Set();

const server = net.createServer((client) => {
  sockets.add(client);
  client.setNoDelay(true);

  const upstream = net.connect(TARGET_PORT, TARGET_HOST);
  upstream.setNoDelay(true);

  client.pipe(upstream);
  upstream.pipe(client);

  const cleanup = () => {
    sockets.delete(client);
    client.destroy();
    upstream.destroy();
  };

  client.on('error', cleanup);
  upstream.on('error', cleanup);
  client.on('close', cleanup);
  upstream.on('close', cleanup);
});

server.on('error', (err) => {
  if (err.code === 'EACCES') {
    console.error(`[proxy] Нет доступа к порту ${LISTEN_PORT}. Запустите от имени администратора (порт < 1024) или задайте PROXY_PORT=8080.`);
  } else {
    console.error('[proxy] Ошибка сервера:', err.message);
  }
  process.exit(1);
});

server.listen(LISTEN_PORT, HOST, () => {
  console.log(`[proxy] http://${'aiternitas.local'}:${LISTEN_PORT}  →  ${TARGET_HOST}:${TARGET_PORT} (Vite dev)`);
  console.log('[proxy] Проброс HTTP + WebSocket активен. Ctrl+C — остановить.');
});

const shutdown = () => {
  console.log('\n[proxy] Останавливаю проброс…');
  for (const s of sockets) {
    try { s.destroy(); } catch { /* noop */ }
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
