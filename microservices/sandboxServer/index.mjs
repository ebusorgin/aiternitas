import './config.mjs';

import express from 'express';
import cors from 'cors';

import { initDatabase } from './db.mjs';
import sandboxRouter from './routes/sandbox.mjs';
import { initRabbit } from '../_serviceLib/rabbitmq.mjs';

const PORT = parseInt(process.env.SANDBOX_PORT || '4006', 10);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: [FRONTEND_URL, 'http://localhost:3001'], credentials: true }));
app.use(express.json({ limit: '5mb' }));

app.use('/sandbox', sandboxRouter);

app.get('/', (req, res) => res.send('sandboxServer is running on port ' + PORT));

async function bootstrap() {
  try {
    console.log('[sandboxServer] Starting...');
    await initDatabase();
    // Bus connection so the sandbox can publish `user.task.updated` when it creates tasks.
    await initRabbit('sandbox');

    app.listen(PORT, () => {
      console.log(`[sandboxServer] 🚀 Listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('[sandboxServer] BOOTSTRAP ERROR', err);
    process.exit(1);
  }
}

bootstrap();

async function shutdown(signal) {
  console.log(`\n🛑 [sandboxServer] ${signal} - shutting down...`);
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
