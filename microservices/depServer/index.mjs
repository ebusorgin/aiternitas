import './config.mjs';
import express from 'express';
import cors from 'cors';
import { taskOrchestrator } from './TaskOrchestrator.mjs';

 // Корневой .env


const app = express();
const PORT = 4004;

app.use(cors());
app.use(express.json());

// API для получения статусов задач или принудительного триггера оркестратора
app.post('/api/tasks/trigger', (req, res) => {
  taskOrchestrator.processPendingTasks().catch(console.error);
  res.json({ message: 'Orchestrator triggered' });
});

app.get('/', (req, res) => res.send('depServer is running on port ' + PORT));

app.listen(PORT, () => {
  console.log(`[depServer] Listening on port ${PORT}`);
  // Запускаем оркестратор
  taskOrchestrator.start();
});
