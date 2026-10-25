import './config.mjs';

import rabbit, { initRabbit } from '../_serviceLib/rabbitmq.mjs';
import { initDatabase } from './db.mjs';
import { runSandboxChat } from './services/sandboxChat.mjs';

// sandboxServer is now a pure bus consumer: it opens NO HTTP port.
// userServer forwards sandbox chat over the bus as `sandbox.chat.run`
// (request carries corrId + replyTo; we answer with rabbit.respond()).
async function bootstrap() {
  try {
    console.log('[sandboxServer] Starting...');
    await initDatabase();

    await initRabbit('sandbox');

    await rabbit.consume(async (event, data) => {
      if (event !== 'sandbox.chat.run') return;
      const { userId, conversationId, text, model, socketId } = data || {};
      const result = await runSandboxChat({ userId, conversationId, text, model, socketId });
      await rabbit.respond(data, result);
    });

    console.log('[sandboxServer] 🚀 ready (bus-only, no HTTP port)');
  } catch (err) {
    console.error('[sandboxServer] BOOTSTRAP ERROR', err);
    process.exit(1);
  }
}

bootstrap();

async function shutdown(signal) {
  console.log(`\n🛑 [sandboxServer] ${signal} - shutting down...`);
  try { await rabbit.close(); } catch (_) {}
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
