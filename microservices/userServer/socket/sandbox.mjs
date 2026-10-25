import pool from '../db.mjs';
import { listModels } from '../services/aiClient.mjs';
import rabbit from '../../_serviceLib/rabbitmq.mjs';



const SYSTEM_PROMPT = `Ты ИИ-Оркестратор (Главный Департамент) системы Aiternitas. Ты общаешься с Владельцем через Песочницу.
Твоя задача — анализировать запросы Владельца. 
Если запрос простой (поболтать, что-то спросить) — отвечай просто текстом.
ЕСЛИ ЗАПРОС ТРЕБУЕТ СОЗДАНИЯ ПРОГРАММЫ, ПАРСЕРА, ВИДЖЕТА С ДАННЫМИ (погода, биржа, статистика) ИЛИ ВЫПОЛНЕНИЯ СЛОЖНОГО ДЕЙСТВИЯ — ты ДОЛЖЕН создать Задачу для внутреннего Департамента.

ОТВЕЧАЙ СТРОГО В ФОРМАТЕ JSON! Никакого лишнего текста вне JSON, только валидный объект.

Структура ответа (СТРОГО СОБЛЮДАЙ):
{
  "text": "Твой текстовый ответ пользователю. ВСЕГДА строка.",
  "create_task": { // Добавляй этот блок ТОЛЬКО если нужно разработать/запустить код или плагин
    "title": "Название задачи",
    "description": "Детальное описание того, какой скрипт/плагин нужно создать"
  },
  "widget": { // Используй только если нужно ВЫВЕСТИ УЖЕ ГОТОВЫЕ статические данные прямо сейчас
    "type": "text",
    "title": "Заголовок",
    "content": "Строка данных"
  }
}

Пример ответа на запрос "Сделай виджет прогноза погоды на 7 дней":
{
  "text": "Принято. Формирую задачу для отдела разработки на создание скрипта парсинга погоды.",
  "create_task": {
    "title": "Разработка виджета погоды (7 дней)",
    "description": "Нужно написать Python скрипт для парсинга погоды на 7 дней и возврата JSON-результата."
  }
}`;

export function setupSandboxHandlers(io, socket) {
  // NOTE (bus migration): регистрация больше не привязана к соединению, поэтому
  // проверка авторизации перенесена внутрь обработчиков; userId читается динамически.
  const currentUserId = () => socket.userId;

  socket.on('sandbox:conversations:list', async (data, callback) => {
    const userId = currentUserId();
    if (!userId) return callback?.({ success: false, error: 'Требуется авторизация' });
    try {
      const result = await pool.query(
        'SELECT id, title, model, created_at, updated_at FROM sandbox_conversations WHERE user_id = $1 ORDER BY updated_at DESC',
        [userId]
      );
      socket.emit('sandbox:conversations:list', result.rows);
      callback?.({ success: true });
    } catch (error) {
      console.error('sandbox:conversations:list error:', error);
      socket.emit('sandbox:conversations:list', []);
      callback?.({ success: true });
    }
  });

  socket.on('sandbox:conversation:load', async (data) => {
    const userId = currentUserId();
    if (!userId) return;
    try {
      const { conversationId } = data;
      const convResult = await pool.query(
        'SELECT * FROM sandbox_conversations WHERE id = $1 AND user_id = $2',
        [conversationId, userId]
      );
      if (convResult.rows.length === 0) return;
      const conversation = convResult.rows[0];
      const msgsResult = await pool.query(
        'SELECT sender, text, widget, created_at FROM sandbox_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
        [conversationId]
      );
      socket.emit('sandbox:conversation:loaded', { conversation, messages: msgsResult.rows });
    } catch (error) {
      console.error('sandbox:conversation:load error:', error);
    }
  });

  socket.on('sandbox:conversation:create', async (data) => {
    const userId = currentUserId();
    if (!userId) return;
    try {
      const model = data && data.model ? data.model : 'llama3';
      const result = await pool.query(
        'INSERT INTO sandbox_conversations (user_id, title, model) VALUES ($1, $2, $3) RETURNING *',
        [userId, 'Новый чат', model]
      );
      socket.emit('sandbox:conversation:created', result.rows[0]);
    } catch (error) {
      console.error('sandbox:conversation:create error:', error);
    }
  });

  socket.on('sandbox:conversation:delete', async (data) => {
    const userId = currentUserId();
    if (!userId) return;
    try {
      const { conversationId } = data;
      await pool.query(
        'DELETE FROM sandbox_conversations WHERE id = $1 AND user_id = $2',
        [conversationId, userId]
      );
      socket.emit('sandbox:conversation:deleted', { conversationId });
    } catch (error) {
      console.error('sandbox:conversation:delete error:', error);
    }
  });

  // Chat orchestration lives in sandboxServer. This authenticated socket handler
  // forwards the message over the event bus (userId is trusted server-to-server),
  // then relays the reply back to this user's socket.
  socket.on('sandbox:chat:message', async (data) => {
    const userId = currentUserId();
    if (!userId) return;
    try {
      const { text, conversationId, model = 'llama3' } = data || {};
      // socket.id (из контекста вызова) позволяет sandboxServer стримать ответ
      // на этот сокет как typewriter (sandbox:chat:chunk) через push.socket.
      const result = await rabbit.request(
        'sandbox.chat.run',
        { userId, conversationId, text, model, socketId: socket.id },
        300000
      );
      socket.emit('sandbox:chat:response', result?.success ? result : { text: result?.error || 'Ошибка песочницы' });
    } catch (error) {
      console.error('sandbox:chat:message delegate error:', error);
      socket.emit('sandbox:chat:response', { text: 'Ошибка песочницы: ' + error.message });
    }
  });

  socket.on('sandbox:models:list', async () => {
    if (!currentUserId()) return;
    try {
      const models = await listModels();
      socket.emit('sandbox:models:list', models);
    } catch (e) {
      socket.emit('sandbox:models:list', []);
    }
  });
}
