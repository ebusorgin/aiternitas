import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import rabbit, { initRabbit } from '../microservices/_serviceLib/rabbitmq.mjs';
import pool from '../microservices/sandboxServer/db.mjs';

// Validates cross-process RPC over the bus against the aiServer pure-consumer.
await initRabbit('testbus', { bindings: ['push.#'] });  // isolated temp service (own queue + reply.testbus + push.#)

// Перехватываем push.socket-рассылки (чанки стрима), адресованные нашему
// фиктивному socketId, чтобы подтвердить сквозной typewriter-путь.
let receivedChunks = [];
const streamSeen = [];
const streamDeferred = {};
streamDeferred.promise = new Promise((res) => { streamDeferred.resolve = res; });
await rabbit.consume((event, data) => {
  if (event === 'push.socket' && data && data.to === 'test-stream-sock') {
    receivedChunks.push(data);
    streamSeen.push(data?.data?.delta);
    streamDeferred.resolve();
  }
});

async function check(name, p) {
  try { const r = await p; console.log(`OK   ${name}: ${JSON.stringify(r).slice(0, 200)}`); }
  catch (e) { console.log(`FAIL ${name}: ${e.message}`); }
}

await check('ai.models', rabbit.request('ai.models', {}, 15000));
await check('ai.generate', rabbit.request('ai.generate', { prompt: 'Reply with exactly one word: PONG', requireJson: false }, 60000));

// Nested RPC: sandbox.chat.run -> (inside its handler) sandbox requests ai.generate.
// Validates there is no prefetch/single-queue deadlock on the bus.
try {
  const c = await pool.query("SELECT id, user_id FROM sandbox_conversations ORDER BY updated_at DESC LIMIT 1");
  if (c.rows[0]) {
    const { id, user_id } = c.rows[0];
    await check('sandbox.chat.run (nested)', rabbit.request(
      'sandbox.chat.run',
      { userId: user_id, conversationId: id, text: 'Привет! Просто поболтай со мной одним коротким предложением.', model: 'llama3' },
      120000
    ));
  } else {
    console.log('SKIP sandbox.chat.run: no conversation in DB');
  }
} catch (e) { console.log('FAIL sandbox.chat.run setup:', e.message); }

// Streaming path: ai.generate.stream pushes push.socket deltas to chunkTo and
// replies once with the FULL accumulated text.
try {
  receivedChunks = [];
  const reply = await rabbit.request('ai.generate.stream', {
    prompt: 'Перечисли словами цвета радуги по порядку, с коротким пояснением к каждому.',
    model: 'llama3',
    chunkTo: 'test-stream-sock',
    chunkEvent: 'sandbox:chat:chunk',
  }, 90000);
  await Promise.race([streamDeferred.promise, new Promise((r) => setTimeout(r, 3000))]);
  const full = typeof reply?.response === 'string' ? reply.response : JSON.stringify(reply);
  console.log(`OK   ai.generate.stream: response="${String(full).slice(0, 60)}" chunks=${receivedChunks.length} streamed="${streamSeen.join('').slice(0, 40)}"`);
  if (receivedChunks.length === 0) console.log('WARN ai.generate.stream: no push.socket chunks captured');
} catch (e) { console.log(`FAIL ai.generate.stream: ${e.message}`); }

// End-to-end streaming through sandbox chat (socketId triggers the typewriter branch).
try {
  const c = await pool.query("SELECT id, user_id FROM sandbox_conversations ORDER BY updated_at DESC LIMIT 1");
  if (c.rows[0]) {
    const { id, user_id } = c.rows[0];
    receivedChunks = []; streamSeen.length = 0;
    const r = await rabbit.request('sandbox.chat.run', {
      userId: user_id, conversationId: id,
      text: 'Просто поболтай со мной одним коротким предложением.',
      model: 'llama3', socketId: 'test-stream-sock',
    }, 120000);
    await Promise.race([streamDeferred.promise, new Promise((res) => setTimeout(res, 3000))]);
    console.log(`OK   sandbox.chat.run (stream): text="${String(r?.text || r?.error || '').slice(0, 60)}" chunks=${receivedChunks.length}`);
  }
} catch (e) { console.log(`FAIL sandbox.chat.run (stream): ${e.message}`); }

await rabbit.close();
process.exit(0);
