import pool from '../../../server_old/db.mjs';
import { WorkerAgent } from './WorkerAgent.mjs';
import { callLocalLLM } from '../services/llm_provider.mjs';
import crypto from 'crypto';

class TaskOrchestrator {
  constructor() {
    this.intervalId = null;
    this.isProcessing = false;
  }

  start() {
    console.log('[TaskOrchestrator] Запущен цикл мониторинга задач');
    this.intervalId = setInterval(() => this.processPendingTasks(), 10000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async processPendingTasks() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const result = await pool.query(
        "SELECT * FROM tasks WHERE status = 'pending' ORDER BY created_at ASC LIMIT 5"
      );

      for (const task of result.rows) {
        console.log(`[TaskOrchestrator] Взята в работу задача #${task.id}: ${task.title}`);
        
        await pool.query(
          "UPDATE tasks SET status = 'in_progress', updated_at = NOW() WHERE id = $1",
          [task.id]
        );

        await this.handleTask(task);
      }
    } catch (error) {
      console.error('[TaskOrchestrator] Ошибка обработки задач:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  async handleTask(task) {
    console.log(`[TaskOrchestrator] Анализ задачи #${task.id} нейросетью...`);
    const userId = task.user_id;
    const model = 'llama3'; 

    try {
      // 1. ОПРЕДЕЛЯЕМ ИЛИ СОЗДАЕМ ДЕПАРТАМЕНТ
      const deptsRes = await pool.query("SELECT id, name FROM elements WHERE element_type = 'block' AND user_id = $1", [userId]);
      const depts = deptsRes.rows;
      let deptStr = depts.map(d => `ID: ${d.id}, Название: ${d.name}`).join('; ');
      if (!deptStr) deptStr = 'Нет существующих департаментов.';

      const deptPrompt = `Ты Главный Оркестратор. Задача: "${task.title}" - "${task.description}".
Существующие отделы: ${deptStr}.
Выберите ID существующего отдела для этой задачи ИЛИ предложите название для НОВОГО отдела (например: "Отдел парсеров").
Верни СТРОГО JSON: { "action": "use_existing", "department_id": "ID" } ИЛИ { "action": "create_new", "department_name": "Название нового отдела" }`;

      const deptLLM = await callLocalLLM(deptPrompt, "", model, true);
      let deptResult;
      try { deptResult = JSON.parse(deptLLM); } catch(e) { deptResult = { action: 'create_new', department_name: 'Отдел разработки' }; }

      let targetDeptId;
      let targetDeptName;

      if (deptResult.action === 'use_existing' && deptResult.department_id) {
        targetDeptId = deptResult.department_id;
        const d = depts.find(x => x.id === targetDeptId);
        targetDeptName = d ? d.name : 'Существующий отдел';
      } else {
        targetDeptId = 'dept_' + Date.now();
        targetDeptName = deptResult.department_name || 'Новый отдел разработки';
        await pool.query(
          "INSERT INTO elements (id, user_id, name, element_type) VALUES ($1, $2, $3, $4)",
          [targetDeptId, userId, targetDeptName, 'block']
        );
        await pool.query(
          `INSERT INTO task_comments (task_id, author_id, author_type, content, comment_type) VALUES ($1, $2, 'system', $3, 'report')`,
          [task.id, 'orchestrator', `Создан новый департамент: ${targetDeptName}`]
        );
      }

      // 2. ОПРЕДЕЛЯЕМ ИЛИ СОЗДАЕМ РАБОТНИКА
      const workersRes = await pool.query(
        `SELECT e.id, e.name, e.description as ai_prompt 
         FROM elements e 
         JOIN elements_connections c ON e.id = c.to_element_id 
         WHERE c.from_element_id = $1 AND e.element_type = 'worker'`,
        [targetDeptId]
      );
      const workers = workersRes.rows;
      let workersStr = workers.map(w => `ID: ${w.id}, Имя: ${w.name}, Промпт: ${w.ai_prompt}`).join('; ');
      if (!workersStr) workersStr = 'Нет существующих работников в этом отделе.';

      const workerPrompt = `Ты Директор департамента "${targetDeptName}". Задача: "${task.title}" - "${task.description}".
Существующие ИИ-работники: ${workersStr}.
Выберите ID подходящего работника ИЛИ создайте НОВОГО ИИ-работника, определив его имя и базовую инструкцию (ai_prompt).
Верни СТРОГО JSON: { "action": "use_existing", "worker_id": "ID" } ИЛИ { "action": "create_new", "worker_name": "Имя (например Python-программист)", "ai_prompt": "Краткая инструкция, например: Ты пишешь python скрипты" }`;

      const workerLLM = await callLocalLLM(workerPrompt, "", model, true);
      let workerResult;
      try { workerResult = JSON.parse(workerLLM); } catch(e) { workerResult = { action: 'create_new', worker_name: 'AI-Разработчик', ai_prompt: 'Ты опытный программист.' }; }

      let targetWorkerId;
      let targetWorkerPrompt;

      if (workerResult.action === 'use_existing' && workerResult.worker_id) {
        targetWorkerId = workerResult.worker_id;
        const w = workers.find(x => x.id === targetWorkerId);
        targetWorkerPrompt = w ? w.ai_prompt : 'Ты ИИ-помощник';
      } else {
        targetWorkerId = 'worker_' + Date.now() + '_' + crypto.randomBytes(2).toString('hex');
        const wName = workerResult.worker_name || 'AI-Разработчик';
        targetWorkerPrompt = workerResult.ai_prompt || 'Ты решаешь задачи';
        
        await pool.query(
          "INSERT INTO elements (id, user_id, name, element_type, description) VALUES ($1, $2, $3, $4, $5)",
          [targetWorkerId, userId, wName, 'worker', targetWorkerPrompt]
        );
        await pool.query(
          "INSERT INTO elements_connections (id, user_id, from_element_id, to_element_id) VALUES ($1, $2, $3, $4)",
          ['conn_' + Date.now(), userId, targetDeptId, targetWorkerId]
        );
        await pool.query(
          `INSERT INTO task_comments (task_id, author_id, author_type, content, comment_type) VALUES ($1, $2, 'system', $3, 'report')`,
          [task.id, 'orchestrator', `Департамент "${targetDeptName}" нанял нового ИИ-Работника "${wName}". Запускаем выполнение задачи.`]
        );
      }

      // 3. ПЕРЕДАЧА ЗАДАЧИ И ЗАПУСК
      await pool.query(
        "UPDATE tasks SET assigned_to_worker_id = $1 WHERE id = $2",
        [targetWorkerId, task.id]
      );

      // Инициализируем WorkerAgent
      const agent = new WorkerAgent(targetWorkerId, targetWorkerPrompt, targetDeptId);
      agent.run(task.id).catch(err => console.error(`Ошибка WorkerAgent(taskId: ${task.id}):`, err));

    } catch (err) {
      console.error('Ошибка в handleTask:', err);
      await pool.query(
        `INSERT INTO task_comments (task_id, author_id, author_type, content, comment_type) VALUES ($1, $2, 'system', $3, 'report')`,
        [task.id, 'orchestrator', `Сбой при маршрутизации задачи: ${err.message}`]
      );
    }
  }
}

export const taskOrchestrator = new TaskOrchestrator();

taskOrchestrator.start();
