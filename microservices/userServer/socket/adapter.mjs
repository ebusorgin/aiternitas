// SocketAdapter — shim Socket.IO-сокета поверх RabbitMQ-шины.
// Позволяет существующим обработчикам userServer (auth/flowchart/tasks/sandbox),
// написанным как `socket.on('event', (data, callback) => ...)`, работать без
// изменений: гейт присылает конверты, adapter маршрутизирует их в те же
// зарегистрированные обработчики и отвечает на `reply.socket`.

import crypto from 'crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import rabbit from '../../_serviceLib/rabbitmq.mjs';

// corrId -> { ack(event, payload) } — ожидающие RPC-ответы (aiServer и т.д.)
const pendingReplies = new Map();

const REPLY_TIMEOUT = 120000;

export class SocketAdapter {
  constructor() {
    // Конкурентный per-invocation контекст вместо сериализации через единый
    // мутабельный сокет: долгий хендлер (flowchart-генерация, decompose,
    // стриминг чата) больше не блокирует шину и не мешает abort/clarification,
    // а identify-поля читаются динамически из AsyncLocalStorage.
    this._als = new AsyncLocalStorage();
    // bootCtx — fallback-контекст, когда вне als.run(...) (например фоновые
    // рассылки, mail-receiver через ioShim).
    this._bootCtx = this._ctxFrom({});
    this._boot();
  }

  _ctxFrom(env) {
    return {
      userId: env.userId ?? null,
      userName: env.userName ?? null,
      userEmail: env.userEmail ?? null,
      socketId: env.socketId ?? null,
      httpSessionId: env.httpSessionId ?? null,
      cookie: typeof env.cookie === 'string' ? env.cookie : '',
    };
  }

  // Текущий контекст вызова (или boot-фолбэк).
  _ctx() {
    return this._als.getStore() || this._bootCtx;
  }

  _boot() {
    const self = this;
    const ctx = () => self._ctx();
    this.socket = {
      _handlers: new Map(),

      on(event, fn) { this._handlers.set(event, fn); },

      // Идентификация читается/пишется в текущий per-call контекст, поэтому
      // конкурентные вызовы не затирают друг друга.
      get userId() { return ctx().userId; },
      set userId(v) { ctx().userId = v; },
      get userName() { return ctx().userName; },
      set userName(v) { ctx().userName = v; },
      get userEmail() { return ctx().userEmail; },
      set userEmail(v) { ctx().userEmail = v; },
      get socketId() { return ctx().socketId; },
      set socketId(v) { ctx().socketId = v; },
      // Socket.IO-эквивалент: handlers (flowchart abort/clarification) Key по socket.id.
      get id() { return ctx().socketId; },
      set id(v) { ctx().socketId = v; },
      get httpSessionId() { return ctx().httpSessionId; },
      set httpSessionId(v) { ctx().httpSessionId = v; },

      request: {
        headers: {
          get cookie() { return ctx().cookie; },
          set cookie(v) { ctx().cookie = typeof v === 'string' ? v : ''; },
        },
      },

      // push конкретному клиенту (гейт доставит по socketId текущего контекста)
      emit(event, data) {
        return self._publishPush('socket', { to: ctx().socketId, event, data });
      },

      // broadcast в комнату пользователя
      to(room) {
        return {
          emit(event, data) {
            return self._publishPush('room', { room, event, data });
          }
        };
      },

      join() {},
      leave() {},
      disconnect() {},
    };
  }

  ioShim() {
    const self = this;
    return {
      emit(event, data) {
        return self._publishPush('all', { event, data });
      },
      to(room) {
        return {
          emit(event, data) {
            return self._publishPush('room', { room, event, data });
          }
        };
      },
      sockets: { sockets: new Map() },
    };
  }

  _publishPush(kind, payload) {
    return rabbit.publish(`push.${kind}`, payload).catch((e) => {
      console.error('[SocketAdapter] push failed:', e.message);
    });
  }

  // RPC-вызов в другой домен шины (ai.sandbox.run и т.п.) с ожиданием ответа
  request(routingKey, data, timeoutMs = REPLY_TIMEOUT) {
    return new Promise((resolve, reject) => {
      const corrId = crypto.randomUUID();
      const timer = setTimeout(() => {
        pendingReplies.delete(corrId);
        reject(new Error(`RPC timeout: ${routingKey}`));
      }, timeoutMs);

      pendingReplies.set(corrId, {
        ack: (payload) => { clearTimeout(timer); pendingReplies.delete(corrId); resolve(payload); }
      });

      rabbit.publish(routingKey, { corrId, replyTo: 'reply.user', ...data }).catch((e) => {
        clearTimeout(timer);
        pendingReplies.delete(corrId);
        reject(e);
      });
    });
  }

  // Обработка RPC-ответа, пришедшего в очередь сервиса
  handleReply(data) {
    const corrId = data?.corrId;
    if (!corrId) return;
    const pending = pendingReplies.get(corrId);
    if (!pending) return;
    pending.ack(data.error ? { error: data.error } : (data && 'result' in data ? data.result : data));
  }

  // Точка входа consumer-колбэка: event — routing key вида `auth.check`.
  // Конкурентно: каждый конверт выполняется в собственном AsyncLocalStorage
  // контексте, длинные операции не блокируют обработку последующих событий.
  handle(event, envelope) {
    return this.call(event, envelope)
      .catch((e) => console.error('[SocketAdapter] handle error:', e.message));
  }

  async call(event, envelope) {
    if (!envelope || typeof envelope !== 'object' || !envelope.event) return false;

    const socket = this.socket;
    const handler = socket._handlers.get(envelope.event);
    if (!handler) {
      // обработчик не зарегистрирован — не молчим, а отвечаем ошибкой,
      // чтобы гейт снял client-ack и не ловил таймаут
      if (envelope.corrId) {
        await rabbit.reply('reply.socket', {
          corrId: envelope.corrId,
          error: `NO_HANDLER: ${envelope.event} is not migrated to the bus yet`
        }, envelope.corrId);
      }
      return false;
    }

    // Снимать контекст нужно ЗДЕСЬ (envelope ещё доступен), а выполнить
    // хендлер уже внутри als.run, чтобы все socket.* чтения/записи этого
    // вызова попали в его личный контекст.
    const ctx = this._ctxFrom(envelope);

    let replied = false;
    const ack = (result) => {
      if (replied || !envelope.corrId) return;
      replied = true;
      const payload = (result && typeof result === 'object' && 'error' in result && Object.keys(result).length === 1)
        ? { corrId: envelope.corrId, error: result.error }
        : { corrId: envelope.corrId, result: result ?? null };
      rabbit.reply('reply.socket', payload, envelope.corrId).catch((e) => {
        console.error('[SocketAdapter] reply failed:', e.message);
      });
    };

    return this._als.run(ctx, async () => {
      try {
        await handler(envelope.args ?? {}, ack);
        // если обработчик синхронный и не вызвал ack, но что-то вернул
        // (обработчики handlers пишут callback-стиль, так что обычно ack уже вызван)
      } catch (e) {
        console.error(`[SocketAdapter] handler '${envelope.event}' error:`, e.message);
        ack({ error: e.message });
      }
      // fire-and-forget без corrId: handler всё равно выполнен
      return true;
    });
  }
}

export default SocketAdapter;
