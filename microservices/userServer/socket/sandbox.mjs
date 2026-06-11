import pool from '../db.mjs';
import { callLocalLLM, checkOllamaStatus } from '../services/llm_provider.mjs';
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
  const userId = socket.userId;
  if (!userId) return;

  socket.on('sandbox:conversations:list', async () => {
    try {
      const result = await pool.query(
        'SELECT id, title, model, created_at, updated_at FROM sandbox_conversations WHERE user_id = $1 ORDER BY updated_at DESC',
        [userId]
      );
      socket.emit('sandbox:conversations:list', result.rows);
    } catch (error) {
      console.error('sandbox:conversations:list error:', error);
      socket.emit('sandbox:conversations:list', []);
    }
  });

  socket.on('sandbox:conversation:load', async (data) => {
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

  socket.on('sandbox:chat:message', async (data) => {

    try {
      await rabbit.send({type: 'sandbox:chat:message', data: { userId, ...data }});
      return
      const { text, conversationId, model = 'llama3' } = data;

      await pool.query(
        'INSERT INTO sandbox_messages (conversation_id, sender, text) VALUES ($1, $2, $3)',
        [conversationId, 'user', text]
      );

      const convCheck = await pool.query(
        'SELECT title FROM sandbox_conversations WHERE id = $1', [conversationId]
      );
      if (convCheck.rows[0] && convCheck.rows[0].title === 'Новый чат') {
        const title = text.substring(0, 60);
        await pool.query(
          'UPDATE sandbox_conversations SET title = $1, model = $2, updated_at = NOW() WHERE id = $3',
          [title, model, conversationId]
        );
      } else {
        await pool.query(
          'UPDATE sandbox_conversations SET updated_at = NOW(), model = $1 WHERE id = $2',
          [model, conversationId]
        );
      }

      
      // 1. ATOMIC PROMPT: Определяем тип запроса
      const typePrompt = "Ты классификатор. Пользователь написал: '" + text + "'. Если он просит создать виджет, написать парсер, вытащить данные с сайта или решить сложную задачу программирования - ответь строго одним словом 'task'. Если это просто разговор или вопрос - ответь 'chat'.";
      const typeResponse = await callLocalLLM(typePrompt, "", model, false);
      const isTask = typeResponse && typeResponse.toLowerCase().includes('task');

      let parsed = { text: "" };

      if (isTask) {
        // 2. ATOMIC PROMPT: Извлекаем суть задачи
        const extractPrompt = "Пользователь написал: '" + text + "'. Извлеки из этого задачу для отдела разработки. Верни СТРОГО JSON: { \"title\": \"краткое название\", \"description\": \"подробное описание того, что нужно запрограммировать\" }";
        const extractResponse = await callLocalLLM(extractPrompt, "", model, true);
        
        let taskData;
        try { taskData = JSON.parse(extractResponse); } catch(e) { taskData = { title: "Новая задача", description: text }; }

        // Проверяем/создаем Департамент Разработки
        const deptRes = await pool.query("SELECT id FROM elements WHERE name = 'Департамент Разработки' AND user_id = $1", [userId]);
        let deptId;
        if (deptRes.rows.length > 0) {
          deptId = deptRes.rows[0].id;
        } else {
          deptId = 'dept_' + Date.now();
          await pool.query("INSERT INTO elements (id, user_id, name, element_type) VALUES ($1, $2, $3, $4)", [deptId, userId, 'Департамент Разработки', 'department']);
        }

        // Проверяем/создаем Колонку "To Do" для канбана
        const colRes = await pool.query("SELECT id FROM task_columns WHERE user_id = $1 ORDER BY position ASC LIMIT 1", [userId]);
        let colId;
        if (colRes.rows.length > 0) {
          colId = colRes.rows[0].id;
        } else {
          const newCol = await pool.query("INSERT INTO task_columns (user_id, title, position) VALUES ($1, 'К выполнению', 0) RETURNING id", [userId]);
          colId = newCol.rows[0].id;
        }

        // Создаем задачу
        const taskRes = await pool.query(
          `INSERT INTO tasks (user_id, department_id, column_id, title, description, status) 
           VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
          [userId, deptId, colId, taskData.title || 'Разработка виджета', taskData.description || text]
        );
        const taskId = taskRes.rows[0].id;
        parsed.text = `Понял вас. Я сформировал задачу #${taskId} ("${taskData.title}") и передал её в Департамент Разработки. Специалисты скоро приступят к написанию скрипта.`;
      } else {
        // 3. ATOMIC PROMPT: Обычный чат
        const chatPrompt = "Ты ИИ-ассистент Владельца. Ответь на его сообщение: '" + text + "'. Отвечай кратко и по делу. Верни СТРОГИЙ JSON: { \"text\": \"твой ответ\" }";
        const chatResponse = await callLocalLLM(chatPrompt, "", model, true);
        try { parsed = JSON.parse(chatResponse); } catch(e) { parsed = { text: chatResponse }; }
      }

      if (!parsed.text) parsed.text = JSON.stringify(parsed);

      await pool.query(
        'INSERT INTO sandbox_messages (conversation_id, sender, text, widget) VALUES ($1, $2, $3, $4)',
        [conversationId, 'agent', parsed.text, parsed.widget ? JSON.stringify(parsed.widget) : null]
      );

      socket.emit('sandbox:chat:response', parsed);

    } catch (error) {
      console.error('Ошибка Sandbox Chat:', error);
      const errMsg = 'Ошибка при обращении к нейросети: ' + error.message;
      if (data && data.conversationId) {
        await pool.query(
          'INSERT INTO sandbox_messages (conversation_id, sender, text) VALUES ($1, $2, $3)',
          [data.conversationId, 'agent', errMsg]
        ).catch(() => {});
      }
      socket.emit('sandbox:chat:response', { text: errMsg });
    }
  });

  socket.on('sandbox:models:list', async () => {
    try {
      const status = await checkOllamaStatus();
      socket.emit('sandbox:models:list', status.ok ? status.models : []);
    } catch (e) {
      socket.emit('sandbox:models:list', []);
    }
  });
}
