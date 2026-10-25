import './config.mjs';
import { consumeTasks } from './utils/amqpClient.mjs';
import { WorkerAgent } from './WorkerAgent.mjs';
import pool, { initDatabase } from './db.mjs';
import rabbit, { initRabbit } from '../_serviceLib/rabbitmq.mjs';

// workerServer is a pure bus/queue consumer: no HTTP port. It consumes tasks
// from `tasks_queue` (RabbitMQ) and reaches the LLM via the event bus
// (utils/aiClient -> rabbit.request). We still must consume our own queue so
// that `reply.worker` RPC replies (from aiServer) get delivered back to us.
async function startWorker() {
  console.log('[workerServer] Подключение к БД...');
  await initDatabase();

  console.log('[workerServer] Подключение к шине событий (RabbitMQ)...');
  await initRabbit('worker');
  await rabbit.consume(() => {}); // enables reply.worker delivery (no direct work events)

  console.log('[workerServer] Ожидание задач из RabbitMQ...');
  consumeTasks('tasks_queue', async (taskData) => {
    console.log(`[workerServer] Получена задача:`, taskData);

    // Создаем экземпляр WorkerAgent
    const agent = new WorkerAgent({ id: taskData.workerId, name: "Worker", description: taskData.workerPrompt });

    // Запускаем
    await agent.processTask({ id: taskData.taskId, title: taskData.taskTitle, description: taskData.taskDescription });
    console.log(`[workerServer] Задача #${taskData.taskId} успешно обработана!`);
  }).catch(err => {
    console.error('[workerServer] Ошибка RabbitMQ:', err);
  });
}

startWorker().catch(err => {
  console.error('[workerServer] Fatal error:', err);
  process.exit(1);
});
