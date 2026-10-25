// Реестр socket-событий гейта.
// Определяет, как каждое клиентское событие маршрутизируется:
//   mode: 'local'  — обрабатывается самим гейтом (ping/status)
//   mode: 'bus'    — публикуется в RabbitMQ-очередь целевого сервиса
// authRequired: событие доступно только авторизованным соединениям.

// Домен события (до первого ':') -> имя сервиса-владельца на шине.
// Маппинг расширяется по мере миграции доменов из userServer.
export const DOMAIN_SERVICES = {
  auth: 'user',
  flowchart: 'user',
  task: 'user',
  tasks: 'user',
  sandbox: 'user',
  mail: 'user',
  chat: 'user',
  scene: 'user',
  element: 'user',
  connection: 'user',
};

export const DEFAULT_SERVICE = 'user';

// публичные события (доступны без авторизации)
export const PUBLIC_EVENTS = new Set([
  'ping',
  'status',
  'auth:check',
]);

// локальные события, обрабатываемые самим гейтом
export const LOCAL_EVENTS = new Set([
  'ping',
  'status',
]);

// таймауты ожидания ответа из шины по конкретным событиям (мс)
export const EVENT_TIMEOUTS = {
  'flowchart:generate-company': 310000,
  'task:decompose': 120000,
};

export const DEFAULT_TIMEOUT = 15000;

// Routing key в шину для события: domain.action (auth:check -> auth.check)
export function toRoutingKey(event) {
  return event.replaceAll(':', '.');
}

// Сервис-владелец события по домену
export function serviceForEvent(event) {
  const domain = event.split(':')[0];
  return DOMAIN_SERVICES[domain] || DEFAULT_SERVICE;
}

// Таймаут ожидания ack для события
export function timeoutForEvent(event) {
  return EVENT_TIMEOUTS[event] ?? DEFAULT_TIMEOUT;
}

// === Входящие события шины -> рассылка клиентам ===
// broadcast-события (event -> { clientEvent, target })
// target: 'all' | 'room' (room берётся из envelope) | 'user' (room user:{userId})
export const BROADCAST_EVENTS = {
  'system.metrics': { clientEvent: 'system:metrics', target: 'all' },
  'socket.metrics': { clientEvent: 'system:metrics', target: 'all' },
  // legacy-мост (опубликовано старым кодом userServer через rabbit.publish)
  'user.chat.message': { clientEvent: 'sandbox:chat:response', target: 'user' },
  'user.task.updated': { clientEvent: 'task:updated', target: 'user' },
  'user.telegram.message': { clientEvent: 'telegram:message', target: 'room-or-all' },
  'user.mail.new': { clientEvent: 'mail:new', target: 'user' },
};

// === Push от SocketAdapter-шеймов сервисов (user.#, chat.# и т.д.) ===
// push.socket: { to: socketId, event, data } — конкретному сокету
// push.room:   { room, event, data }        — комнате (io.to(room).emit)
// push.all:    { event, data }              — всем (io.emit)
export const PUSH_KEYS = new Set(['push.socket', 'push.room', 'push.all']);
