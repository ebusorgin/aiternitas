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
