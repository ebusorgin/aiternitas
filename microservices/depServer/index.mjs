import './config.mjs';
import rabbit, { initRabbit } from '../_serviceLib/rabbitmq.mjs';
import { taskOrchestrator } from './TaskOrchestrator.mjs';

// depServer is a pure consumer: it opens NO HTTP port. The orchestrator polls
// PostgreSQL for pending tasks and reaches the LLM via the event bus
// (utils/aiClient -> rabbit.request('ai.generate')). We connect to the bus and
// consume our queue so that `reply.dep` RPC replies get delivered back to us.
async function bootstrap() {
  console.log('[depServer] Подключение к шине событий (RabbitMQ)...');
  await initRabbit('dep');
  await rabbit.consume(() => {});

  // Запускаем оркестратор (цикл.polling по БД каждые 10с)
  taskOrchestrator.start();
  console.log('[depServer] 🚀 running (bus-only, no HTTP port)');
}

bootstrap().catch((err) => {
  console.error('[depServer] BOOTSTRAP ERROR', err);
  process.exit(1);
});

async function shutdown(signal) {
  console.log(`\n🛑 [depServer] ${signal} - shutting down...`);
  taskOrchestrator.stop();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
