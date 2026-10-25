import './config.mjs';

import rabbit, { initRabbit } from '../_serviceLib/rabbitmq.mjs';
import { callLocalLLM, callLocalLLMStream, checkOllamaStatus } from './services/llm_provider.mjs';

// aiServer is now a pure bus consumer: it opens NO HTTP port. Other services
// reach the LLM via RPC over the shared `events` exchange:
//   rabbit.request('ai.generate', { prompt, model, systemPrompt, requireJson })
//   rabbit.request('ai.chat',     { prompt, systemPrompt, model, jsonFormat, temperature, numPredict })
// Each request carries `corrId` + `replyTo`; we answer with rabbit.respond().
await initRabbit('ai');

console.log('[AI Worker] 🚀 started (bus-only, no HTTP port)');

await rabbit.consume(async (event, data) => {
  if (event === 'ai.generate') {
    const { prompt, model, systemPrompt, requireJson } = data || {};
    if (!prompt) {
      await rabbit.respond(data, { error: 'prompt is required' });
      return;
    }
    try {
      const response = await callLocalLLM(prompt, systemPrompt || '', model, !!requireJson);
      // Keep the wire format a string (callLocalLLM returns an object when jsonFormat=true).
      await rabbit.respond(data, {
        response: typeof response === 'string' ? response : JSON.stringify(response)
      });
    } catch (e) {
      console.error('[AI Worker] generate error:', e.message);
      await rabbit.respond(data, { error: e.message });
    }
    return;
  }

  if (event === 'ai.generate.stream') {
    // Стриминговый вариант ai.generate: провайдер гонит Ollama stream:true и на
    // каждый дельта-чанк публикует push.socket { to: chunkTo, event: chunkEvent,
    // data: { corrId, delta } } — гейт доставляет его на сокет клиента (typewriter).
    // Финальный полный текст отдаётся одним RPC-ответом через rabbit.respond().
    const { prompt, model, systemPrompt, chunkTo, chunkEvent } = data || {};
    if (!prompt) {
      await rabbit.respond(data, { error: 'prompt is required' });
      return;
    }
    const evName = chunkEvent || 'ai:stream:chunk';
    try {
      const full = await callLocalLLMStream(prompt, systemPrompt || '', model, async (delta) => {
        if (!chunkTo) return; // стрим некуда — просто накапливаем
        await rabbit.publish('push.socket', {
          to: chunkTo,
          event: evName,
          data: { corrId: data.corrId || null, delta },
        }).catch((e) => console.error('[AI Worker] stream chunk publish error:', e.message));
      });
      await rabbit.respond(data, { response: full });
    } catch (e) {
      console.error('[AI Worker] generate.stream error:', e.message);
      await rabbit.respond(data, { error: e.message });
    }
    return;
  }

  if (event === 'ai.chat') {
    const { prompt, systemPrompt, model, jsonFormat, temperature, numPredict } = data || {};
    if (!prompt) {
      await rabbit.respond(data, { success: false, error: 'prompt is required' });
      return;
    }
    try {
      const answer = await callLocalLLM(prompt, systemPrompt || '', model, !!jsonFormat, {
        temperature,
        numPredict,
      });
      await rabbit.respond(data, { success: true, answer });
    } catch (e) {
      console.error('[AI Worker] chat error:', e.message);
      await rabbit.respond(data, { success: false, error: e.message });
    }
    return;
  }

  if (event === 'ai.models') {
    const status = await checkOllamaStatus();
    await rabbit.respond(data, status.ok
      ? { success: true, models: status.models }
      : { success: false, error: status.error, offline: true, models: [] });
    return;
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
