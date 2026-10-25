import './config.mjs';

import express from 'express';
import rabbit, { initRabbit } from '../_serviceLib/rabbitmq.mjs';
import { callLocalLLM, checkOllamaStatus } from './services/llm_provider.mjs';

const AI_PORT = parseInt(process.env.AI_PORT || '4003', 10);

// Bind this service to its own queue / `ai.#` routing key (unique per service).
await initRabbit('ai');

//
// HTTP API (used by userServer / depServer / workerServer via AI_SERVER_URL)
//
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/', (req, res) => res.send('aiServer is running on port ' + AI_PORT));

app.get('/api/ai/models', async (req, res) => {
  const status = await checkOllamaStatus();
  if (!status.ok) {
    return res.status(500).json({ success: false, error: status.error, offline: true });
  }
  res.json({ success: true, models: status.models });
});

// Non-streaming single-prompt generation (native /api/generate semantics kept for dep/worker).
app.post('/api/ai/generate', async (req, res) => {
  const { prompt, model, systemPrompt, requireJson } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  try {
    const response = await callLocalLLM(prompt, systemPrompt || '', model, !!requireJson);
    // callLocalLLM returns an object when jsonFormat=true; keep wire format a string
    res.json({ response: typeof response === 'string' ? response : JSON.stringify(response) });
  } catch (e) {
    console.error('[AI Server] generate error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Chat-style call returning raw content (used by aiClient / company-generator).
// Supports systemPrompt + generation options (temperature, num_predict/max tokens).
app.post('/api/ai/chat', async (req, res) => {
  const { prompt, systemPrompt, model, jsonFormat, temperature, numPredict } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  try {
    const answer = await callLocalLLM(prompt, systemPrompt || '', model, !!jsonFormat, {
      temperature,
      numPredict,
    });
    res.json({ success: true, answer });
  } catch (e) {
    console.error('[AI Server] chat error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.listen(AI_PORT, () => {
  console.log(`[AI Server] 🌐 HTTP listening on port ${AI_PORT}`);
});

console.log('[AI Worker] 🚀 started');

//
// RabbitMQ consumer: async chat requests routed to `ai.#`.
// `ai.chat.message` -> call LLM -> publish result back on `user.chat.message`.
//
await rabbit.consume(async (msg, data) => {
  console.log('[AI Worker] request:', msg, data);
  const { userId, text, conversationId, model, systemPrompt } = data || {};

  if (msg !== 'ai.chat.message') return;

  try {
    const answer = await callLocalLLM(text, systemPrompt || '', model, false);
    console.log('[AI Worker] answer ready for user', userId);
    await rabbit.publish('user.chat.message', { userId, conversationId, answer });
  } catch (err) {
    console.error('[AI Worker] error:', err);
    await rabbit.publish('user.chat.message', {
      userId,
      conversationId,
      answer: null,
      status: 'error',
      error: err.message,
    });
  }
});

//
// Graceful shutdown
//
async function shutdown(signal) {
  console.log(`[AI Server] ${signal} received, shutting down...`);
  try {
    await rabbit.close();
  } catch (_) {}
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
