const fs = require('fs');

// 1. Update llm_provider.mjs to export checkOllamaStatus
let llmProvider = fs.readFileSync('server/services/llm_provider.mjs', 'utf8');
if (!llmProvider.includes('checkOllamaStatus')) {
  const checkFunc = `
export async function checkOllamaStatus() {
  try {
    const response = await fetch(\`\${OLLAMA_HOST}/api/tags\`);
    if (response.ok) {
      const data = await response.json();
      const models = data.models ? data.models.map(m => m.name) : [];
      return { ok: true, models };
    }
    return { ok: false, error: \`HTTP \${response.status}\` };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
`;
  llmProvider += checkFunc;
  fs.writeFileSync('server/services/llm_provider.mjs', llmProvider);
}

// 2. Update server.mjs
let serverMjs = fs.readFileSync('server/server.mjs', 'utf8');
if (!serverMjs.includes('checkOllamaStatus')) {
  // Add import
  serverMjs = serverMjs.replace(
    "import { startWatchdog } from './agents/SystemWatchdog.mjs';",
    "import { startWatchdog } from './agents/SystemWatchdog.mjs';\nimport { checkOllamaStatus } from './services/llm_provider.mjs';"
  );
  
  // Add check logic
  const checkLogic = `
    console.log('🔍 Проверка подключения к локальной нейросети (Ollama)...');
    const ollamaStatus = await checkOllamaStatus();
    if (!ollamaStatus.ok) {
      console.error('❌ FATAL: Не удалось подключиться к серверу Ollama (порт 11434).');
      console.error(\`Ошибка: \${ollamaStatus.error}\`);
      console.error('Сервер остановлен согласно политике Владельца. Запустите Ollama и повторите попытку.');
      process.exit(1);
    }
    console.log(\`✅ Связь с Ollama установлена. Доступные модели: \${ollamaStatus.models.join(', ')}\`);
    `;
    
  serverMjs = serverMjs.replace(
    "initDatabase()\n  .then(async () => {",
    `initDatabase()\n  .then(async () => {${checkLogic}`
  );
  fs.writeFileSync('server/server.mjs', serverMjs);
}
