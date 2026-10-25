// Подключение Socket.IO-обработчиков userServer к RabbitMQ-шине.
// Существующие handlers (auth/flowchart/tasks/sandbox) регистрируют socket.on(...)
// на FakeSocket из SocketAdapter — код обработчиков не меняется.
// scene.mjs не подключается: его события ('element:*', 'scene:*') клиент не
// использует (легаси), мост к ним выключен при переходе на гейт.

import { SocketAdapter } from './adapter.mjs';
import { setupAuthHandlers } from './auth.mjs';
import { setupFlowchartHandlers } from './flowchart.mjs';
import { setupTaskHandlers } from './tasks.mjs';
import { setupSandboxHandlers } from './sandbox.mjs';

export function createBusSocketHandlers(sessionStore) {
  const adapter = new SocketAdapter();
  // Единый fake-сокет: в шине нет пер-connection semantics, все обработчики
  // (register-once) живут в одном реестре; идентификаторы (userId/socketId/
  // cookie) читаются динамически из AsyncLocalStorage-контекста каждого вызова
  // (см. adapter.mjs), поэтому конкурентные сообщения от разных userId больше
  // не затирают друг друга между await-точками.
  const socket = adapter.socket;
  const io = adapter.ioShim();

  // регистрация всех socket.on(...) в реестр adapter'а
  setupAuthHandlers(io, socket, sessionStore);
  setupFlowchartHandlers(io, socket);
  setupTaskHandlers(io, socket);
  setupSandboxHandlers(io, socket);

  console.log(`[BusHandlers] registered ${socket._handlers.size} handlers:`, [...socket._handlers.keys()].join(', '));

  return {
    adapter,
    // consumer-колбэк для rabbit.consume(...) в index.mjs
    handle: (event, data, properties = {}) => {
      // RPC-ответы других доменов (ai.sandbox.run и т.п.)
      if (event.startsWith('reply.')) {
        adapter.handleReply(data);
        return;
      }

      // Команда с шины = конверт гейта: event вида 'domain:action'
      // (собственные publish-рассылки сервиса, вроде user.chat.message,
      // игнорируем — они адресованы гейту)
      if (!data || typeof data !== 'object' || !/^([\w-]+:[\w:-]+|\w+\.\w[\w.]*)$/.test(String(data.event || ''))) {
        return;
      }

      adapter.handle(event, data);
    },
  };
}
