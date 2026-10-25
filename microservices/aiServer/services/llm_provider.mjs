// Local LLM provider via Ollama (single point of truth for local model calls).
// Using ollama REST API (default http://127.0.0.1:11434)

const OLLAMA_HOST = process.env.OLLAMA_HOST || process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const DEFAULT_MODEL = process.env.AI_MODEL || 'llama3';

/**
 * Вызов локальной модели
 * @param {string} prompt - Текст запроса
 * @param {string} system - Системный промпт (инструкции агенту)
 * @param {string} model - Имя модели (default: llama3)
 * @param {boolean} jsonFormat - Использовать ли JSON режим (возвращает только JSON)
 * @param {{temperature?:number, numPredict?:number}} [options] - Доп. параметры генерации
 */
export async function callLocalLLM(prompt, system = '', model = DEFAULT_MODEL, jsonFormat = false, options = {}) {
  try {
    const payload = {
      model,
      messages: [],
      stream: false
    };

    if (jsonFormat) {
      payload.format = 'json';
    }

    // Опции генерации (температура / лимит токенов) — только если переданы
    if (options.temperature !== undefined || options.numPredict !== undefined) {
      payload.options = {};
      if (options.temperature !== undefined) payload.options.temperature = options.temperature;
      if (options.numPredict !== undefined) payload.options.num_predict = options.numPredict;
    }

    if (system) {
      payload.messages.push({ role: 'system', content: system });
    }

    payload.messages.push({ role: 'user', content: prompt });

    const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    let content = data.message?.content || '';

    if (jsonFormat) {
      // Пытаемся очистить ответ от Markdown блоков
      if (content.startsWith('```json')) content = content.slice(7);
      if (content.startsWith('```')) content = content.slice(3);
      if (content.endsWith('```')) content = content.slice(0, -3);
      content = content.trim();
      return JSON.parse(content);
    }

    return content;
  } catch (error) {
    console.error('Ошибка вызова Ollama:', error);
    throw error;
  }
}

/**
 * Стриминговый вызов локальной модели (Ollama stream:true, NDJSON).
 * onDelta(chunkText) вызывается на каждый токен-чанк; возвращается полный текст.
 * jsonFormat не используется (стримим только обычный текст).
 * @param {string} prompt
 * @param {string} system
 * @param {string} model
 * @param {(delta:string)=>void|Promise<void>} onDelta
 * @param {{temperature?:number,numPredict?:number,signal?:AbortSignal}} [options]
 */
export async function callLocalLLMStream(prompt, system = '', model = DEFAULT_MODEL, onDelta, options = {}) {
  const payload = {
    model,
    messages: [],
    stream: true,
  };

  if (options.temperature !== undefined || options.numPredict !== undefined) {
    payload.options = {};
    if (options.temperature !== undefined) payload.options.temperature = options.temperature;
    if (options.numPredict !== undefined) payload.options.num_predict = options.numPredict;
  }

  if (system) payload.messages.push({ role: 'system', content: system });
  payload.messages.push({ role: 'user', content: prompt });

  const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: options.signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
  }

  if (!response.body) throw new Error('Ollama streaming: no response body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  // Ollama отдаёт NDJSON: по одному JSON-объекту в строке, content в data.message.content
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let obj;
      try { obj = JSON.parse(trimmed); } catch { continue; }
      if (obj.error) throw new Error(`Ollama stream error: ${obj.error}`);
      const delta = obj.message?.content ?? '';
      if (delta) {
        full += delta;
        if (typeof onDelta === 'function') await onDelta(delta);
      }
      if (obj.done) break;
    }
  }

  return full;
}

/**
 * Проверка доступности сервера Ollama и списка загруженных моделей
 */
export async function checkOllamaStatus() {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (!response.ok) return { ok: false, error: response.statusText };
    const data = await response.json();
    return { ok: true, models: (data.models || []).map(m => m.name) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
