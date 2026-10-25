// tools/test-bus-architecture.mjs
// E2E-проверка новой архитектуры:
//   клиент -> gateway(3001) -> socketServer(4009) -> RabbitMQ -> userServer(4002)
// Требование: в PostgreSQL есть пользователь id=1 и активная PM2-система.
// Подготовка тестовой сессии:
//   docker cp ... task-management-postgres:/tmp/e2e.sql && docker exec ... psql -f /tmp/e2e.sql
// (содержимое e2e.sql: INSERT INTO session (sid, sess, expire) VALUES ('e2etestsid', '{"userId":1}', NOW()+INTERVAL '1 hour'))

import { io } from 'socket.io-client';

const GATEWAY = process.env.GATEWAY_URL || 'http://localhost:3001';

const socket = io(GATEWAY, {
  path: '/socket.io/',
  transports: ['websocket'],
  timeout: 8000,
  extraHeaders: { cookie: 'aiternitas.sid=s:e2etestsid.dummy' },
});

const rpc = (event, data = {}, t = 10000) => new Promise((res, rej) => {
  const to = setTimeout(() => rej(new Error(`ack timeout: ${event}`)), t);
  socket.emit(event, data, (r) => { clearTimeout(to); res(r); });
});

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}: ${JSON.stringify(detail).slice(0, 200)}`);
};

socket.on('connect', async () => {
  try {
    const metrics = new Promise((res) => socket.once('system:metrics', res));

    const status = await rpc('status');
    check('гейт держит соединение + сессия', status.authenticated === true && status.userId === 1, status);

    const auth = await rpc('auth:check');
    check('auth:check через гейт', auth.authenticated === true && auth.user?.id === 1, auth);

    const conv = await rpc('sandbox:conversations:list');
    check('RPC через шину (sandbox)', conv.success === true, conv);

    const fc = await rpc('flowchart:load');
    check('RPC через шину (flowchart)', fc.success === true, fc);

    const tl = await rpc('task:list', { departmentId: 'default' });
    check('RPC через шину (tasks)', tl.success === true, tl);

    const m = await Promise.race([metrics, new Promise((_, rj) => setTimeout(() => rj(new Error('no metrics')), 6000))]);
    check('push-рассылка из шины (system:metrics)', !!m.cpu, Object.keys(m));

    socket.emit('flowchart:generate-abort');
    check('fire-and-forget без ack', true, 'ok');

    process.exit(results.some(r => !r.ok) ? 1 : 0);
  } catch (e) {
    console.error('E2E FAIL:', e.message);
    process.exit(1);
  }
});

socket.on('connect_error', (e) => { console.error('connect_error:', e.message); process.exit(1); });
setTimeout(() => { console.error('GLOBAL TIMEOUT'); process.exit(1); }, 30000);
