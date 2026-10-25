import express from 'express';
import pool from '../db.mjs';
import { callLocalLLM } from '../utils/aiClient.mjs';
import rabbit from '../../_serviceLib/rabbitmq.mjs';

const router = express.Router();

// Sandbox assistant system prompt (Owner-facing orchestrator).
const SYSTEM_PROMPT = `Ты ИИ-Оркестратор (Главный Департамент) системы Aiternitas. Ты общаешься с Владельцем через Песочницу.
Твоя задача — анализировать запросы Владельца.
Если запрос простой (поболтать, что-то спросить) — отвечай просто текстом.
ЕСЛИ ЗАПРОС ТРЕБУЕТ СОЗДАНИЯ ПРОГРАММЫ, ПАРСЕРА, ВИДЖЕТА С ДАННЫМИ ИЛИ ВЫПОЛНЕНИЯ СЛОЖНОГО ДЕЙСТВИЯ — ты ДОЛЖЕН создать Задачу для внутреннего Департамента.
Отвечай СТРОГО в формате JSON: { "text": "ответ", "create_task": { "title": "...", "description": "..." } } (create_task только если нужна задача).`;

// POST /sandbox/chat  { userId, conversationId, text, model }
// Runs the full sandbox orchestration: persist user msg, classify (chat vs task),
// create a pending task for depServer when needed, call the LLM via aiServer,
// persist the agent reply and return it. Live UI delivery is handled by the
// caller (userServer socket handler) and, for tasks, via the event bus.
router.post('/chat', async (req, res) => {
  const { userId, conversationId, text, model = 'llama3' } = req.body || {};

  if (!userId || !conversationId || !text) {
    return res.status(400).json({ success: false, error: 'userId, conversationId и text обязательны' });
  }

  try {
    // 1. Persist the incoming user message.
    await pool.query(
      'INSERT INTO sandbox_messages (conversation_id, sender, text) VALUES ($1, $2, $3)',
      [conversationId, 'user', text]
    );

    // 2. Title/model bookkeeping.
    const convCheck = await pool.query(
      'SELECT title FROM sandbox_conversations WHERE id = $1', [conversationId]
    );
    if (convCheck.rows[0] && convCheck.rows[0].title === 'Новый чат') {
      await pool.query(
        'UPDATE sandbox_conversations SET title = $1, model = $2, updated_at = NOW() WHERE id = $3',
        [text.substring(0, 60), model, conversationId]
      );
    } else {
      await pool.query(
        'UPDATE sandbox_conversations SET updated_at = NOW(), model = $1 WHERE id = $2',
        [model, conversationId]
      );
    }

    // 3. Classify the request.
    const typePrompt = "Ты классификатор. Пользователь написал: '" + text + "'. Если он просит создать виджет, написать парсер, вытащить данные с сайта или решить сложную задачу программирования - ответь строго одним словом 'task'. Если это просто разговор или вопрос - ответь 'chat'.";
    const typeResponse = await callLocalLLM(typePrompt, model, '', false);
    const isTask = typeResponse && typeResponse.toLowerCase().includes('task');

    let parsed = { text: '' };

    if (isTask) {
      // 4a. Extract the task and create it (depServer will orchestrate execution).
      const extractPrompt = "Пользователь написал: '" + text + "'. Извлеки из этого задачу для отдела разработки. Верни СТРОГО JSON: { \"title\": \"краткое название\", \"description\": \"подробное описание того, что нужно запрограммировать\" }";
      const extractResponse = await callLocalLLM(extractPrompt, model, '', true);

      let taskData;
      try {
        taskData = typeof extractResponse === 'string' ? JSON.parse(extractResponse) : extractResponse;
      } catch {
        taskData = { title: 'Новая задача', description: text };
      }

      // Ensure a development department exists.
      const deptRes = await pool.query("SELECT id FROM elements WHERE name = 'Департамент Разработки' AND user_id = $1", [userId]);
      let deptId;
      if (deptRes.rows.length > 0) {
        deptId = deptRes.rows[0].id;
      } else {
        deptId = 'dept_' + Date.now();
        await pool.query("INSERT INTO elements (id, user_id, name, element_type) VALUES ($1, $2, $3, $4)", [deptId, userId, 'Департамент Разработки', 'block']);
      }

      // Ensure a backlog column exists for the department.
      const colRes = await pool.query("SELECT id FROM task_columns WHERE user_id = $1 AND department_id = $2 ORDER BY position ASC LIMIT 1", [userId, deptId]);
      let colId;
      if (colRes.rows.length > 0) {
        colId = colRes.rows[0].id;
      } else {
        const newCol = await pool.query("INSERT INTO task_columns (user_id, department_id, name, position, is_default) VALUES ($1, $2, 'Бэклог', 0, true) RETURNING id", [userId, deptId]);
        colId = newCol.rows[0].id;
      }

      const taskRes = await pool.query(
        `INSERT INTO tasks (user_id, department_id, column_id, title, description, status)
         VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
        [userId, deptId, colId, taskData.title || 'Разработка виджета', taskData.description || text]
      );
      const taskId = taskRes.rows[0].id;

      // Notify the UI of the newly created task via the bus.
      rabbit.publish('user.task.updated', { userId, task: { id: taskId, title: taskData.title, status: 'pending' } })
        .catch((e) => console.error('[sandbox] publish task.updated error:', e.message));

      parsed.text = `Понял вас. Я сформировал задачу #${taskId} ("${taskData.title}") и передал её в Департамент Разработки. Специалисты скоро приступят к выполнению.`;
    } else {
      // 4b. Plain chat reply.
      const chatPrompt = SYSTEM_PROMPT + "\n\nПользователь: " + text + "\nВерни СТРОГИЙ JSON: { \"text\": \"твой ответ\" }";
      const chatResponse = await callLocalLLM(chatPrompt, model, '', true);
      try {
        parsed = typeof chatResponse === 'string' ? JSON.parse(chatResponse) : (chatResponse || parsed);
      } catch {
        parsed = { text: typeof chatResponse === 'string' ? chatResponse : JSON.stringify(chatResponse) };
      }
    }

    if (!parsed.text) parsed.text = JSON.stringify(parsed);

    // 5. Persist the agent reply.
    await pool.query(
      'INSERT INTO sandbox_messages (conversation_id, sender, text, widget) VALUES ($1, $2, $3, $4)',
      [conversationId, 'agent', parsed.text, parsed.widget ? JSON.stringify(parsed.widget) : null]
    );

    res.json({ success: true, ...parsed });
  } catch (error) {
    console.error('[sandbox] chat error:', error);
    const errMsg = 'Ошибка при обращении к нейросети: ' + error.message;
    await pool.query(
      'INSERT INTO sandbox_messages (conversation_id, sender, text) VALUES ($1, $2, $3)',
      [conversationId, 'agent', errMsg]
    ).catch(() => {});
    res.status(500).json({ success: false, error: errMsg, text: errMsg });
  }
});

// GET /sandbox/conversations?userId=
router.get('/conversations', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ success: false, error: 'userId обязателен' });
  try {
    const result = await pool.query(
      'SELECT id, title, model, created_at, updated_at FROM sandbox_conversations WHERE user_id = $1 ORDER BY updated_at DESC',
      [userId]
    );
    res.json({ success: true, conversations: result.rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
