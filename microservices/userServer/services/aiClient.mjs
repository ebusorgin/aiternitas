// LLM client for userServer, routed through the shared event bus.
// aiServer is a pure consumer (no HTTP); these helpers use rabbit.request()
// and rely on userServer consuming its own `reply.user` queue (set up in index.mjs).
import rabbit from '../../_serviceLib/rabbitmq.mjs';

const DEFAULT_MODEL = process.env.AI_MODEL || 'llama3:latest';
const LLM_TIMEOUT = 300000; // 5 min - local generations can be slow

// Single-prompt generation. Returns the raw string from the model
// (JSON string when requireJson=true), matching dep/worker contract.
export async function callLocalLLM(prompt, model = 'llama3:latest', systemPrompt = '', requireJson = false) {
  const reply = await rabbit.request('ai.generate', { prompt, model, systemPrompt, requireJson }, LLM_TIMEOUT);
  if (reply?.error) throw new Error(`AI Server error: ${reply.error}`);
  return reply?.response;
}

// Chat-style call returning structured answer (object when jsonFormat=true).
export async function chat(prompt, { model = DEFAULT_MODEL, systemPrompt = '', jsonFormat = false, temperature, numPredict } = {}) {
  const reply = await rabbit.request(
    'ai.chat',
    { prompt, model, systemPrompt, jsonFormat, temperature, numPredict },
    LLM_TIMEOUT
  );
  if (reply?.error) throw new Error(`AI Server error: ${reply.error}`);
  return reply?.answer;
}

// List available Ollama models; returns [] if aiServer/Ollama unreachable.
export async function listModels() {
  try {
    const reply = await rabbit.request('ai.models', {}, 15000);
    return Array.isArray(reply?.models) ? reply.models : [];
  } catch (e) {
    console.error('[aiClient] listModels error:', e.message);
    return [];
  }
}
