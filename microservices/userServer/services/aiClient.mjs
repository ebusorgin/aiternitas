// Thin HTTP client to aiServer (single point of truth for LLM calls).
// Mirrors depServer/workerServer utils/aiClient.mjs but adds chat + models.
// Uses global fetch (Node 18+).

const AI_SERVER_URL = process.env.AI_SERVER_URL || 'http://localhost:4003';
const DEFAULT_MODEL = process.env.AI_MODEL || 'llama3:latest';

// Single-prompt generation. Returns the raw string from the model
// (JSON string when requireJson=true), matching dep/worker contract.
export async function callLocalLLM(prompt, model = 'llama3:latest', systemPrompt = '', requireJson = false) {
  const res = await fetch(`${AI_SERVER_URL}/api/ai/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, model, systemPrompt, requireJson }),
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`AI Server error: ${res.status} - ${errorText}`);
  }
  const data = await res.json();
  return data.response;
}

// Chat-style call returning structured answer (object when jsonFormat=true).
// Supports system prompt + generation options (temperature, num_predict/max tokens).
export async function chat(prompt, { model = DEFAULT_MODEL, systemPrompt = '', jsonFormat = false, temperature, numPredict } = {}) {
  const res = await fetch(`${AI_SERVER_URL}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, model, systemPrompt, jsonFormat, temperature, numPredict }),
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`AI Server error: ${res.status} - ${errorText}`);
  }
  const data = await res.json();
  return data.answer;
}

// List available Ollama models; returns [] if aiServer/Ollama unreachable.
export async function listModels() {
  try {
    const res = await fetch(`${AI_SERVER_URL}/api/ai/models`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.models) ? data.models : [];
  } catch (e) {
    console.error('[aiClient] listModels error:', e.message);
    return [];
  }
}
