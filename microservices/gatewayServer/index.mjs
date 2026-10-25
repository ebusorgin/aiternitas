import express from 'express';
import cors from 'cors';
import { createProxyMiddleware } from 'http-proxy-middleware';
import httpProxy from 'http-proxy';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// CORS для фронтенда
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));


// Опции для HTTP-прокси (БЕЗ ws: true — WebSocket обрабатываем вручную)
const proxyOptions = {
  changeOrigin: true,
  timeout: 0,
  proxyTimeout: 0,
  onError: (err, req, res) => { 
    console.error(`[Gateway] Proxy Error:`, err.message); 
    if (res && res.status) res.status(502).json({ error: 'Microservice unavailable' }); 
  } 
};

// Все HTTP маршруты
// Для /socket.io цель без префикса + pathRewrite: при app.use(path) Express срезает
// префикс, поэтому путь нужно восстановить явно (иначе polling падает в catch-all userServer)
const routes = {
  '/api/auth': 'http://localhost:4002/auth',
  '/api/users': 'http://localhost:4002/users',
  '/api/mail': 'http://localhost:4002/mail',
  '/api/emails': 'http://localhost:4002/emails',
  '/api/messages': 'http://localhost:4002/messages',
  '/api/telegram': 'http://localhost:4007/telegram',
  '/api/upload': 'http://localhost:4002/upload',
  '/api/stats': 'http://localhost:4002/stats',
  '/api/flowcharts': 'http://localhost:4002/flowcharts',
  '/api/plugins': 'http://localhost:4007/plugins'
  // NOTE: /api/ai, /api/tasks, /api/sandbox removed — aiServer/depServer/workerServer/
  // sandboxServer no longer expose HTTP ports; they work purely over the RabbitMQ bus.
};

const proxies = {};

for (const [path, target] of Object.entries(routes)) {
  const proxy = createProxyMiddleware({ target, ...proxyOptions });
  proxies[path] = proxy;
  app.use(path, proxy);
}

// Socket.IO HTTP-polling: сохраняем полный путь /socket.io/* на target
// target — socketServer-гейт (4009), он держит все веб-сокетные соединения
const SOCKET_GATE_URL = process.env.SOCKET_GATE_URL || 'http://localhost:4009';

const socketIoProxy = createProxyMiddleware({
  target: SOCKET_GATE_URL,
  pathRewrite: { '^/': '/socket.io/' },
  ...proxyOptions
});
app.use('/socket.io', socketIoProxy);

// Отдельный прокси для WebSocket-апгрейда (только socket.io)
const wsProxy = httpProxy.createProxyServer({
  target: SOCKET_GATE_URL,
  changeOrigin: true,
  ws: true,
  timeout: 0,
  proxyTimeout: 0
});

wsProxy.on('error', (err, req, socket) => {
  console.error('[Gateway] WS Proxy Error:', err.message);
  if (socket && socket.destroy) socket.destroy();
});

wsProxy.on('proxyReqWs', (proxyReq, req, socket, options, head) => {
  console.log('[Gateway] WS proxying:', req.url, '→ localhost:4002');
});

const server = app.listen(PORT, () => {
  console.log(`[Gateway] Server listening on port ${PORT}`);
});

// Обработка WebSocket (upgrade) — вручную, без дублирования
server.on('upgrade', (req, socket, head) => {
  if (req.url.startsWith('/socket.io')) {
    console.log(`[Gateway] WS Upgrade: ${req.url} → SocketGate (${SOCKET_GATE_URL})`);
    wsProxy.ws(req, socket, head);
  } else {
    console.log(`[Gateway] WS Upgrade: unknown path ${req.url}, destroying socket`);
    socket.destroy();
  }
});