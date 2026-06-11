import './config.mjs';
import express from 'express';
import cors from 'cors';
import { consumeTasks } from './utils/amqpClient.mjs';
import { WorkerAgent } from './WorkerAgent.mjs';
import pool, { initDatabase } from './db.mjs';

 // Корневой .env


const app = express();
const PORT = 4005;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.send('workerServer is running on port ' + PORT));

// Функция запуска воркера
async function startWorker() {
  console.log('[workerServer] Подключение к БД...');
  await initDatabase();
  
  console.log(`[workerServer] Listening on port ${PORT}`);
  app.listen(PORT);

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
