import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import { callLocalLLM } from '../services/llm_provider.mjs';
import pool from '../../../server_old/db.mjs';

const execPromise = util.promisify(exec);

export class WorkerAgent {
  constructor(workerData, io = null) {
    this.id = workerData.id;
    this.name = workerData.name;
    this.io = io;
    this.description = workerData.description || 'ИИ-сотрудник';
    this.responsibilities = workerData.properties?.responsibilities || [];
    this.kpis = workerData.properties?.kpis || [];
    
    // Эволюционирующий системный промпт, если есть
    this.customPrompt = workerData.properties?.ai_prompt || '';
  }

  log(message, type = 'info') {
    console.log(`[Agent ${this.name}] ${message}`);
    if (this.io) {
      this.io.emit('agent:log', { 
        agentId: this.id, 
        name: this.name, 
        message, 
        type, 
        timestamp: new Date().toISOString() 
      });
    }
  }

  getSystemPrompt() {
    let prompt = `Ты автономный ИИ-сотрудник корпоративной системы. Твоя роль: ${this.name}.
Описание: ${this.description}
Обязанности:
${this.responsibilities.map(r => '- ' + r).join('\n')}

${this.customPrompt}

У тебя есть доступ к следующим ИНСТРУМЕНТАМ. Чтобы использовать инструмент, верни СТРОГИЙ JSON в следующем формате, без дополнительных пояснений:
{
  "action": "имя_инструмента",
  "args": { "параметр": "значение" }
}

Доступные ИНСТРУМЕНТЫ:
1. "fs_read" - чтение файла. args: { "path": "абсолютный путь" }
20. "search_plugin" - поиск существующего плагина в базе (если нужно сделать парсер, проверь, нет ли его). args: { "query": "погода" }
21. "write_script" - создать файл скрипта (создает папку плагина + README). args: { "plugin_name": "weather_parser", "filename": "script.py", "content": "код" }
22. "execute_docker" - запустить код в Docker. Используй готовый образ aiternitas-sandbox:latest. args: { "plugin_name": "weather_parser", "image": "aiternitas-sandbox:latest", "command": "python /scripts/script.py" }
23. "save_plugin" - сохранить успешный скрипт как плагин для будущих вызовов. args: { "name": "Weather", "description": "...", "filename": "script.py", "language": "python", "image": "python:3.10-alpine" }
2. "fs_write" - запись в файл. args: { "path": "путь", "content": "содержимое" }
3. "bash_execute" - запуск консольной команды в Docker-песочнице (Linux-контейнер). args: { "command": "команда" }
4. "add_task_comment" - оставить комментарий/отчет к задаче. args: { "content": "текст" }
5. "change_task_status" - изменить статус задачи. args: { "status": "in_progress" | "review" | "completed" }
6. "delegate_to_human" - передать задачу человеку, если не можешь выполнить. args: { "reason": "причина" }
7. "add_flowchart_node" - создать новый элемент (например, департамент или должность) в структуре компании. args: { "flowchartId": "ID", "name": "имя", "type": "department" | "worker" }
8. "hire_agent" - создать ИИ-помощника (нового работника) в текущем отделе. args: { "name": "имя", "description": "описание роли" }
9. "delegate_task" - пeredatь текущую задачу другому работник؃. args: { "workerId": "ID_нового_работника" }
10. "store_memory" - сохранить полезную информацию или выводы по текущей задаче для будущих ИИ. args: { "type": "lesson_learned", "content": "информация" }
11. "search_memory" - искать информацию в глобальной base памяти ИГ. args: { "query": "текст" }
12. "create_subtask" - создать новую задачу в канбан-доске для другого отдела/работника. args: { "title": "заголовол", "description": "описание", "workerId": "ID_кому_назначить" }
14. "check_subordinates_load" - отслеживает нагрузку подчиненных нод (количество активных задач), выступает в качестве балансировщика. args: {}
15. "evolve_system" - позволяет агентам изменять исходный код Aiternitas (самосовершенствоваться/эволюционировать). args: { "path": "путь_к_файлу", "content": "новое содержимое", "description": "описание" }
13. "done" - завершить работу над задачей успешно. args: {}

ПРАВИЛО: Возвращай ТОЛЬКО 1 JSON-объект. Не пиши текст до или после JSON. Скрипты (bash_execute) выполняются в изолированной Linux-песочнице (Docker) в папке /workspace. Рабочая директория хоста проецируется в /workspace.
`;
    return prompt;
  }

  async executeTool(action, args, taskId) {
    this.log(`Executing tool: ${action} with args: ${JSON.stringify(args)}`, 'tool_call');
    
    try {
      switch (action) {
        case 'fs_read':
          return await fs.readFile(args.path, 'utf8');
          
        case 'fs_write':
          // Убеждаемся, что директория существует
          await fs.mkdir(path.dirname(args.path), { recursive: true });
          await fs.writeFile(args.path, args.content, 'utf8');
          return `Файл ${args.path} успешно записан.`;
          
        case 'bash_execute':
          const forbidden = ['rm -rf', 'format', 'shutdown', 'mkfs'];
          if (forbidden.some(cmd => args.command.toLowerCase().includes(cmd))) {
             return 'TOOL ERROR: Command forbidden for security reasons.';
          }
          const crypto = require('crypto');
          const scriptName = '.temp_exec_' + crypto.randomBytes(4).toString('hex') + '.sh';
          const tempScriptPath = require('path').join(process.cwd(), scriptName);
          await require('fs').promises.writeFile(tempScriptPath, args.command, 'utf8');
          let stdout = '';
          let stderr = '';
          try {
            const dockerCmd = 'docker run --rm -v "' + process.cwd() + '":/workspace -w /workspace node:18-alpine sh /workspace/' + scriptName;
            const result = await execPromise(dockerCmd);
            stdout = result.stdout;
            stderr = result.stderr;
          } catch(err) {
            stdout = err.stdout || '';
            stderr = err.stderr || err.message;
          } finally {
            await require('fs').promises.unlink(tempScriptPath).catch(() => {});
          }
          return `STDOUT:\n${stdout}\nSTDERR:\n${stderr}`;
          
        case 'add_task_comment':
          await pool.query(
            `INSERT INTO task_comments (task_id, author_id, author_type, content, comment_type)
             VALUES ($1, $2, 'worker', $3, 'report')`,
            [taskId, this.id, args.content]
          );
          return 'Комментарий успешно добавлен.';
          
        case 'search_plugin': {
          const res = await pool.query("SELECT id, name, description, script_path, language FROM system_plugins WHERE name ILIKE $1 OR description ILIKE $1 LIMIT 5", ['%' + args.query + '%']);
          if (res.rows.length === 0) return 'Плагины не найдены. Нужно написать новый.';
          return 'Найденные плагины: ' + JSON.stringify(res.rows);
        }
        case 'write_script': {
          const pluginName = args.plugin_name || args.filename.replace('.py', '').replace('.js', '');
          const scriptsDir = require('path').join(process.cwd(), 'server', 'generated_scripts', pluginName);
          await require('fs').promises.mkdir(scriptsDir, { recursive: true });
          
          const filePath = require('path').join(scriptsDir, args.filename);
          await require('fs').promises.writeFile(filePath, args.content, 'utf8');
          
          const readmePath = require('path').join(scriptsDir, 'README.md');
          const readmeContent = `# ${pluginName}\n\nСкрипт: ${args.filename}\nСоздан автоматически ИИ-Агентом.\n\nОписание: Этот скрипт выполняет задачу по запросу пользователя.`;
          await require('fs').promises.writeFile(readmePath, readmeContent, 'utf8');
          
          return 'Скрипт и README сохранены в папке: ' + scriptsDir;
        }
        case 'execute_docker': {
          const pluginName = args.plugin_name || 'unknown';
          const scriptsDir = require('path').join(process.cwd(), 'server', 'generated_scripts', pluginName);
          
          // Проверяем существует ли папка
          if (!require('fs').existsSync(scriptsDir)) {
             return 'ERROR: Папка скрипта не найдена: ' + scriptsDir;
          }
          
          // В контейнере монтируем директорию со скриптами в /scripts
          // Используем заготовленный толстый образ
          const image = args.image || 'aiternitas-sandbox:latest';
          const cmd = `docker run --rm -v "${scriptsDir}":/scripts ${image} sh -c "${args.command}"`;
          try {
            const { exec } = require('child_process');
            const util = require('util');
            const execAsync = util.promisify(exec);
            const { stdout, stderr } = await execAsync(cmd, { timeout: 45000 });
            return 'STDOUT:\n' + stdout + '\nSTDERR:\n' + stderr;
          } catch (e) {
            return 'ERROR:\n' + (e.stdout || '') + '\n' + (e.stderr || e.message);
          }
        }
        case 'save_plugin': {
          const pluginName = args.plugin_name || args.name;
          const scriptsDir = require('path').join('server', 'generated_scripts', pluginName);
          await pool.query(
            "INSERT INTO system_plugins (name, description, script_path, language, docker_image) VALUES ($1, $2, $3, $4, $5)",
            [args.name, args.description, scriptsDir, args.language, args.image || 'aiternitas-sandbox:latest']
          );
          return 'Плагин успешно зарегистрирован в системе.';
        }
        case 'change_task_status':
          await pool.query(
            `UPDATE tasks SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [args.status, taskId]
          );
          // Системный комментарий о смене статуса
          await pool.query(
            `INSERT INTO task_comments (task_id, author_id, author_type, content, comment_type)
             VALUES ($1, $2, 'worker', $3, 'status_change')`,
            [taskId, this.id, `Изменил статус задачи на: ${args.status}`]
          );
          return `Статус изменен на ${args.status}.`;
          
        case 'add_flowchart_node':
          const elemId = `elem_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
          // Get user_id from taskRecord (passed via taskId? No, we need it. Let's query it or assume the agent's user_id if we have it. Wait, WorkerAgent doesn't store user_id. We can query tasks table)
          const tRes = await pool.query(`SELECT user_id FROM tasks WHERE id = $1`, [taskId]);
          const userId = tRes.rows[0]?.user_id;
          
          await pool.query(
            `INSERT INTO elements (id, user_id, name, element_type) VALUES ($1, $2, $3, $4)`,
            [elemId, userId, args.name, args.type || 'department']
          );
          
          const fcRes = await pool.query(`SELECT data FROM flowcharts WHERE id = $1`, [args.flowchartId]);
          if (fcRes.rows.length > 0) {
            const data = fcRes.rows[0].data || { nodes: [], edges: [] };
            data.nodes.push({ id: elemId, position: {x: 100, y: 100}, data: { label: args.name, elementType: args.type || 'department' } });
            await pool.query(`UPDATE flowcharts SET data = $1 WHERE id = $2`, [JSON.stringify(data), args.flowchartId]);
          }
          return `Создан элемент ${elemId} (${args.name}) во флоучарте ${args.flowchartId}.`;
          
        case 'hire_agent':
          const newAgentId = `agent_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
          const agentUserIdRes = await pool.query(`SELECT user_id FROM tasks WHERE id = $1`, [taskId]);
          const agentUserId = agentUserIdRes.rows[0]?.user_id;
          
          await pool.query(
            `INSERT INTO elements (id, user_id, name, description, element_type) VALUES ($1, $2, $3, $4, 'worker')`,
            [newAgentId, agentUserId, args.name, args.description]
          );
          return `Новый ИИ-помощник ${newAgentId} (${args.name}) успешно нанят.`;

        case 'delegate_task':
          await pool.query(
            `UPDATE tasks SET assigned_to_worker_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [args.workerId, taskId]
          );
          await pool.query(
            `INSERT INTO task_comments (task_id, author_id, author_type, content, comment_type)
             VALUES ($1, $2, 'worker', $3, 'status_change')`,
            [taskId, this.id, `Делегировал задачу работнику: ${args.workerId}`]
          );
          return 'EXECUTION_FINISHED'; // Мы передали задачу, завершаем работу текущего агента
          
        case 'store_memory':
          await pool.query(
            'INSERT INTO agent_memory (agent_id, task_id, memory_type, content) VALUES ($1, $2, $3, $4)',
            [this.id, taskId, args.type || 'general', args.content]
          );
          return 'Memory stored successfully.';
          
        case 'search_memory':
          const memRes = await pool.query(
            'SELECT memory_type, content FROM agent_memory WHERE content ILIKE $1 LIMIT 5',
            ['%' + args.query + '%']
          );
          return JSON.stringify(memRes.rows);
          
        case 'create_subtask':
          const tResSub = await pool.query('SELECT flowchart_id FROM tasks WHERE id = $1', [taskId]);
          const flowchartIdSub = tResSub.rows[0]?.flowchart_id;
          await pool.query(
            'INSERT INTO tasks (title, description, status, priority, flowchart_id, assigned_to_worker_id) VALUES ($1, $2, \'pending\', \'medium\', $3, $4)',
            [args.title, args.description, flowchartIdSub, args.workerId]
          );
          return 'Subtask created successfully.';
          
        case 'check_subordinates_load':
          const loadRes = await pool.query(
            "SELECT assigned_to_worker_id, COUNT(id) as active_tasks FROM tasks WHERE status IN ('pending', 'in_progress') AND assigned_to_worker_id IS NOT NULL GROUP BY assigned_to_worker_id"
          );
          return JSON.stringify(loadRes.rows);

        case 'evolve_system':
          await fs.mkdir(path.dirname(args.path), { recursive: true });
          await fs.writeFile(args.path, args.content, 'utf8');
          return "Система успешно эволюционировала: " + args.path + " изменена.";

        case 'delegate_to_human':
        case 'delegate_to_human':
        case 'done':
          return 'EXECUTION_FINISHED';
          
        default:
          return `Unknown tool: ${action}`;
      }
    } catch (error) {
      return `TOOL ERROR: ${error.message}`;
    }
  }

  async processTask(taskRecord) {
    this.log(`Начало работы над задачей: ${taskRecord.title}`, 'info');
    
    // Меняем статус на in_progress
    await this.executeTool('change_task_status', { status: 'in_progress' }, taskRecord.id);

    const taskPrompt = `Тебе поручена задача:
Название: ${taskRecord.title}
Описание: ${taskRecord.description}
Приоритет: ${taskRecord.priority}

Проанализируй задачу и реши, какой инструмент использовать первым. Помни: отвечай ТОЛЬКО JSON объектом.
Если для решения нужно написать код - используй fs_write.
Если нужно запустить скрипт - используй bash_execute.
Если задача выполнена - используй done и перед этим добавь комментарий add_task_comment с отчетом.`;

    let history = `User: ${taskPrompt}\n`;
    let iteration = 0;
    const MAX_ITERATIONS = 7;

    while (iteration < MAX_ITERATIONS) {
      iteration++;
      this.log(`Thinking (Iteration ${iteration})...`, 'thinking');
      
      try {
        const responseJson = await callLocalLLM(history, this.getSystemPrompt(), 'llama3', true);
        
        if (!responseJson || !responseJson.action) {
          throw new Error('Invalid JSON format returned by LLM');
        }

        const { action, args } = responseJson;
        history += `\nAssistant: ${JSON.stringify(responseJson)}\n`;

        const toolResult = await this.executeTool(action, args || {}, taskRecord.id);
        
        if (toolResult === 'EXECUTION_FINISHED') {
          this.log(`Закончил работу над задачей.`, 'success');
          if (action === 'done') {
            await this.executeTool('change_task_status', { status: 'completed' }, taskRecord.id);
          } else if (action === 'delegate_to_human') {
            await this.executeTool('change_task_status', { status: 'escalated' }, taskRecord.id);
            await this.executeTool('add_task_comment', { content: `Требуется помощь человека: ${args.reason}` }, taskRecord.id);
          }
          break;
        }

        history += `\nSystem: Tool result:\n${toolResult}\n\nUser: Что делаем дальше? Верни следующий инструмент в формате JSON.`;

      } catch (error) {
        this.log(`Ошибка: ${error.message}`, 'error');
        history += `\nSystem: Error generating or executing tool: ${error.message}. Please try again and ensure strict JSON format.\n`;
      }
    }

    if (iteration >= MAX_ITERATIONS) {
      this.log(`Достигнут лимит итераций.`, 'warning');
      await this.executeTool('add_task_comment', { content: 'Я достиг лимита шагов и не смог завершить задачу полностью. Требуется ревью.' }, taskRecord.id);
      await this.executeTool('change_task_status', { status: 'review' }, taskRecord.id);
    }
  }
}
