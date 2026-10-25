// Мост Socket.IO <-> RabbitMQ.
// Клиентский ACK (emit(event, data, cb)) поверх шины реализован через
// request/reply: гейт публикует конверт с corrId и ждёт ответ на
// routing key `reply.socket`, где envelope.corrId связывает ответ с сокетом.

import crypto from 'crypto';
import rabbit from '../_serviceLib/rabbitmq.mjs';
import {
  toRoutingKey,
  serviceForEvent,
  timeoutForEvent,
  BROADCAST_EVENTS,
  PUSH_KEYS,
} from './registry.mjs';

// corrId -> { socketId, event, ack, timer }
const inflight = new Map();

export function initBridge(io) {
  // consume-колбэк для гейта: reply.* и рассылки чужих доменов
  return async (event, data, properties = {}) => {
    try {
      // 1. RPC-ответы
      if (event.startsWith('reply.')) {
        const corrId = data?.corrId || properties?.correlationId;
        if (!corrId) return;

        const pending = inflight.get(corrId);
        if (!pending) return; // уже тай-аутнулся / сокет закрыт

        clearTimeout(pending.timer);
        inflight.delete(corrId);

        const socket = io.sockets.sockets.get(pending.socketId);
        if (!socket) return;

        const payload = data?.error
          ? { error: data.error }
          : (data && 'result' in data ? data.result : data);

        // Socket.IO позволяет вызвать ack асинхронно позже — резолвим client-промир
        if (typeof pending.ack === 'function') pending.ack(payload);
        return;
      }

      // 2. push от сервисных SocketAdapter-шеймов
      if (PUSH_KEYS.has(event)) {
        const push = data || {};
        const clientEvent = push.event;
        if (!clientEvent) return;

        if (event === 'push.socket') {
          if (push.to && io.sockets.sockets.has(push.to)) {
            io.sockets.sockets.get(push.to).emit(clientEvent, push.data);
          } else if (push.data?.userId) {
            // сокет мог перезаподключиться — фолбэк в комнату пользователя
            io.to(`user:${push.data.userId}`).emit(clientEvent, push.data);
          }
        } else if (event === 'push.room') {
          if (push.room) io.to(push.room).emit(clientEvent, push.data);
        } else {
          io.emit(clientEvent, push.data);
        }
        return;
      }

      // 3. известные broadcast-события
      const mapped = BROADCAST_EVENTS[event];
      if (!mapped) return;

      const envelope = data && typeof data === 'object' ? data : {};

      // RPC-конверт, адресованный другому сервису (гейт получает его по wildcard
      // user.# и т.п.) — не рассылать
      if (envelope.corrId) return;

      if (mapped.target === 'user' && envelope.userId) {
        io.to(`user:${envelope.userId}`).emit(mapped.clientEvent, envelope);
      } else if (mapped.target === 'room' && envelope.room) {
        io.to(envelope.room).emit(mapped.clientEvent, envelope.data ?? envelope);
      } else if (mapped.target === 'room-or-all') {
        if (envelope.userId) io.to(`user:${envelope.userId}`).emit(mapped.clientEvent, envelope);
        else io.emit(mapped.clientEvent, envelope);
      } else {
        io.emit(mapped.clientEvent, envelope.data ?? envelope);
      }
    } catch (e) {
      console.error('[SocketBridge] consume error:', e.message);
    }
  };
}

// Публикация клиентского события в шину с ожиданием RPC-ответа.
// cb(payload) вызывается ровно один раз: с ответом, ошибкой или таймаутом.
export async function dispatch(socket, event, data, cb) {
  const routingKey = toRoutingKey(event);
  const service = serviceForEvent(event);
  const timeoutMs = timeoutForEvent(event);

  const corrId = crypto.randomUUID();

  const envelope = {
    corrId,
    event,
    userId: socket.userId || null,
    userName: socket.userName || null,
    userEmail: socket.userEmail || null,
    socketId: socket.id,
    cookie: socket.request?.headers?.cookie || '',
    args: (data === undefined || data === null) ? {} : data,
  };

  // fire-and-forget: клиент не ждёт ack (Socket.IO client отдаёт функцию только
  // если ожидает ответ; иначе cb === функция-заглушка не приходит)
  if (!cb) {
    await rabbit.publish(`${service}.${routingKey}`, envelope);
    return;
  }

  const timer = setTimeout(() => {
    inflight.delete(corrId);
    if (typeof cb === 'function') cb({ error: `TIMEOUT: ${service} did not reply to '${event}' within ${timeoutMs}ms` });
  }, timeoutMs);

  inflight.set(corrId, { socketId: socket.id, event, ack: cb, timer });

  socket.once('disconnect', () => {
    const p = inflight.get(corrId);
    if (p) {
      clearTimeout(p.timer);
      inflight.delete(corrId);
    }
  });

  // ack-механика Socket.IO: сервис отвечает на reply.socket, гейт резолвит
  // сохранённый callback-ack клиента (см. initBridge выше)
  await rabbit.publish(`${service}.${routingKey}`, envelope);
}

// Реестр ожидающих ответов (для cleanup/метрик)
export function inflightCount() {
  return inflight.size;
}
