// OpenAI service for generating company structures
// 7-step generation with hierarchy, connections, and validation
import OpenAI from 'openai';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.warn('⚠️ OPENAI_API_KEY not found in environment variables');
} else {
  console.log('✅ OpenAI API key loaded (length:', apiKey.length, ')');
}

// TOR proxy: set TOR_PROXY=socks5://127.0.0.1:9050 to route OpenAI requests via TOR (avoids 403 country block)
const torProxy = process.env.TOR_PROXY;
let openai;

if (torProxy) {
  const { SocksProxyAgent } = require('socks-proxy-agent');
  const nodeFetch = require('node-fetch');
  const agent = new SocksProxyAgent(torProxy);
  const fetchViaTor = (url, opts = {}) => nodeFetch(url, { ...opts, agent });
  openai = new OpenAI({ apiKey: apiKey || 'missing-key', fetch: fetchViaTor });
  console.log('✅ OpenAI requests routed via TOR:', torProxy);
} else {
  openai = new OpenAI({ apiKey: apiKey || 'missing-key' });
  console.warn('⚠️ TOR_PROXY not set — OpenAI may return 403 (country not supported). Set TOR_PROXY=socks5://127.0.0.1:9050 in .env.production and ensure tor.service is running.');
}

// Connection types for organizational structure
const CONNECTION_TYPES = {
  manages: { label: 'Руководит', icon: '👔' },
  reports_to: { label: 'Подчиняется', icon: '📊' },
  collaborates: { label: 'Сотрудничает', icon: '🤝' },
  approves: { label: 'Согласовывает', icon: '✅' },
  consults: { label: 'Консультирует', icon: '💬' },
  supports: { label: 'Обеспечивает', icon: '🔧' }
};

// Helper: call GPT and parse JSON response
async function callGPT(prompt, maxTokens = 4000) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'Ты эксперт по организационным структурам компаний. Всегда отвечай ТОЛЬКО валидным JSON без markdown-форматирования и пояснений.'
      },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    max_tokens: maxTokens
  });

  let content = response.choices[0].message.content.trim();
  
  if (content.startsWith('```json')) content = content.slice(7);
  if (content.startsWith('```')) content = content.slice(3);
  if (content.endsWith('```')) content = content.slice(0, -3);
  content = content.trim();

  return JSON.parse(content);
}

/**
 * STEP 1: Analyze company — оптимальная структура по размеру и отрасли.
 */
async function step1_analyzeCompany(companyName, description) {
  const prompt = `Проанализируй компанию и определи ОПТИМАЛЬНУЮ организационную структуру под её размер и специфику.

Название: ${companyName}
Описание: ${description || 'Не указано'}

Рекомендации (выбирай оптимально, не раздувай):
- Микро (барбершоп, салон, одно кафе): 1 департамент (Услуги/Салон), 3–8 человек, 1 руководитель.
- Малый бизнес: 1–2 департамента, линейная структура.
- Средний/крупный: несколько департаментов, функциональная/матричная при необходимости.

Ответь JSON:
{
  "companySize": "микро/стартап/малый/средний/крупный",
  "industry": "отрасль",
  "businessType": "тип бизнеса",
  "structureType": "линейная/функциональная/матричная",
  "estimatedEmployees": число,
  "managementLevels": ["уровни по размеру"],
  "requiredCLevelRoles": ["роли по размеру"],
  "requiredDepartments": ["департаменты по размеру — для микро один"],
  "statusMessage": "сообщение о следующем шаге (до 40 символов)"
}`;

  return await callGPT(prompt);
}

/**
 * STEP 2: Create C-Level / Top Management (outside departments)
 */
async function step2_createTopManagement(companyName, analysis) {
  const userClarificationBlock = analysis.userClarification
    ? `\nУточнение от пользователя (обязательно учесть): ${analysis.userClarification}\n`
    : '';
  const prompt = `Создай топ-менеджмент компании "${companyName}" — оптимально по размеру (для микро — один владелец/руководитель).

Тип компании: ${analysis.companySize}
Отрасль: ${analysis.industry}
Тип структуры: ${analysis.structureType}
Рекомендуемые роли: ${analysis.requiredCLevelRoles?.join(', ')}${userClarificationBlock}

Топ-менеджеры размещаются на одном уровне с департаментами. Количество и детализацию подбирай под размер компании.

Создай описание для каждого руководителя:
- Функциональные обязанности
- Зоны ответственности
- Ключевые KPI
- Права и полномочия

Ответь JSON:
{
  "executives": [
    {
      "id": "exec_ceo",
      "name": "Имя Фамилия",
      "position": "Генеральный директор",
      "level": "c-level",
      "responsibilities": [
        "Разработка и реализация стратегии развития компании",
        "Принятие ключевых управленческих решений",
        "Представление интересов компании перед партнёрами и инвесторами",
        "Контроль финансовых показателей и выполнения бюджета",
        "Формирование корпоративной культуры",
        "Координация работы топ-менеджмента",
        "Утверждение организационной структуры"
      ],
      "kpis": ["Рост выручки", "Чистая прибыль", "Доля рынка", "Удовлетворённость сотрудников"],
      "authorities": ["Найм/увольнение топ-менеджеров", "Подпись договоров", "Распоряжение бюджетом"],
      "managedDepartmentTypes": ["все"],
      "reportsTo": null
    }
  ],
  "statusMessage": "сообщение о следующем шаге (до 40 символов)"
}`;

  return await callGPT(prompt, 4000);
}

/**
 * STEP 3: Create departments — оптимально по размеру компании.
 */
async function step3_createDepartments(companyName, analysis, executives) {
  const userClarificationBlock = analysis.userClarification
    ? `\nУточнение от пользователя (обязательно учесть): ${analysis.userClarification}\n`
    : '';
  const prompt = `Создай департаменты компании "${companyName}" — оптимально по размеру (для микро — один, например Услуги/Салон).

Анализ:
- Размер: ${analysis.companySize}
- Отрасль: ${analysis.industry}
- Структура: ${analysis.structureType}
- Необходимые департаменты: ${analysis.requiredDepartments?.join(', ')}${userClarificationBlock}

Создай описание для каждого департамента: миссия, ключевые функции, KPI. Классификация: core / support / management.

Ответь JSON:
{
  "departments": [
    {
      "id": "dept_sales",
      "name": "Отдел продаж",
      "mission": "Обеспечение выполнения плана продаж и развитие клиентской базы",
      "description": "Подробное описание функций и задач департамента в 2-3 предложениях",
      "type": "core",
      "functions": [
        "Поиск и привлечение новых клиентов",
        "Ведение переговоров и заключение договоров",
        "Выполнение плана продаж",
        "Развитие отношений с существующими клиентами",
        "Анализ рынка и конкурентов",
        "Подготовка коммерческих предложений",
        "Работа с CRM-системой"
      ],
      "kpis": ["Объём продаж", "Конверсия", "Средний чек", "LTV клиента"],
      "interactsWith": ["Маркетинг", "Производство", "Логистика", "Финансы"],
      "subdepartments": []
    }
  ],
  "statusMessage": "сообщение (до 40 символов)"
}`;

  return await callGPT(prompt, 5000);
}

/**
 * STEP 4: Create department heads with connections to departments
 */
async function step4_createDepartmentHeads(companyName, analysis, executives, departments) {
  const flatDepts = [];
  const flatten = (depts, parentName = null) => {
    depts?.forEach(d => {
      flatDepts.push({ id: d.id, name: d.name, type: d.type, parent: parentName });
      if (d.subdepartments) flatten(d.subdepartments, d.name);
    });
  };
  flatten(departments.departments);

  const userClarificationBlock = analysis.userClarification
    ? `\nУточнение от пользователя (обязательно учесть): ${analysis.userClarification}\n`
    : '';
  const prompt = `Создай руководителей департаментов для "${companyName}" — по одному на департамент (для микро — один руководитель смены/салона).${userClarificationBlock}

Департаменты:
${flatDepts.map(d => `- [${d.id}] ${d.name} (${d.type})`).join('\n')}

Топ-менеджмент:
${executives.executives?.map(e => `- [${e.id}] ${e.position}`).join('\n')}

Для каждого руководителя создай:
1. Функциональные обязанности
2. KPI руководителя
3. Права и полномочия
4. Связи с департаментами

Ответь JSON:
{
  "departmentHeads": [
    {
      "id": "head_sales",
      "name": "Имя Фамилия",
      "position": "Руководитель отдела продаж",
      "level": "head",
      "responsibilities": [
        "Разработка стратегии продаж",
        "Формирование и управление командой",
        "Контроль выполнения плана продаж",
        "Развитие ключевых клиентов",
        "Оптимизация процессов продаж",
        "Бюджетирование отдела",
        "Отчётность перед руководством"
      ],
      "kpis": ["Выполнение плана", "Рост выручки", "Текучесть кадров", "NPS"],
      "authorities": ["Найм сотрудников", "Скидки до 15%", "Бюджет до 1М"],
      "managedDepartments": ["dept_sales"],
      "reportsTo": "exec_cmo"
    }
  ],
  "headToDeptConnections": [
    {
      "headId": "head_sales",
      "departmentId": "dept_sales",
      "connectionType": "manages",
      "description": "Руководит отделом"
    }
  ],
  "statusMessage": "сообщение (до 40 символов)"
}`;

  return await callGPT(prompt, 5000);
}

/**
 * STEP 5: Create workers — оптимально по размеру (для микро — 3–5 в одном отделе).
 */
async function step5_createWorkers(companyName, analysis, departments) {
  const flatDepts = [];
  const flatten = (depts) => {
    depts?.forEach(d => {
      flatDepts.push({ id: d.id, name: d.name, functions: d.functions });
      if (d.subdepartments) flatten(d.subdepartments);
    });
  };
  flatten(departments.departments);

  const userClarificationBlock = analysis.userClarification
    ? `\nУточнение от пользователя (обязательно учесть): ${analysis.userClarification}\n`
    : '';
  const prompt = `Создай сотрудников для компании "${companyName}" — оптимально по размеру. Для микро (один департамент) — 3–5 исполнителей (барберы/мастера и т.п.), без лишних HR/финансов. Для среднего/крупного — по 3–4+ на департамент.

Размер: ${analysis.companySize}, примерно сотрудников: ${analysis.estimatedEmployees}${userClarificationBlock}

Департаменты:
${flatDepts.map(d => `- [${d.id}] ${d.name}: ${d.functions?.slice(0, 3).join(', ')}`).join('\n')}

Для каждого сотрудника: обязанности, компетенции, KPI. Уровни: lead / senior / middle / junior.

Ответь JSON:
{
  "departmentWorkers": [
    {
      "departmentId": "dept_sales",
      "workers": [
        {
          "id": "worker_1",
          "name": "Имя Фамилия",
          "position": "Ведущий менеджер по продажам",
          "level": "lead",
          "responsibilities": [
            "Координация работы команды продаж",
            "Выполнение личного плана по крупным сделкам",
            "Обучение и наставничество сотрудников",
            "Контроль выполнения KPI команды",
            "Ведение переговоров с VIP-клиентами",
            "Подготовка отчётности для руководства",
            "Участие в разработке стратегии продаж"
          ],
          "competencies": ["Управление командой", "Переговоры", "CRM", "Аналитика"],
          "kpis": ["Выполнение плана команды", "Личные продажи", "Конверсия"],
          "authorities": ["Распределение клиентов", "Согласование скидок до 10%"],
          "reportsTo": "head_sales"
        }
      ]
    }
  ],
  "statusMessage": "сообщение (до 40 символов)"
}`;

  return await callGPT(prompt, 6000);
}

/**
 * STEP 6: Create all types of connections
 */
async function step6_createConnections(companyName, executives, departmentHeads, departments) {
  const flatDepts = [];
  const flatten = (depts) => {
    depts?.forEach(d => {
      flatDepts.push({ id: d.id, name: d.name, type: d.type });
      if (d.subdepartments) flatten(d.subdepartments);
    });
  };
  flatten(departments.departments);

  const prompt = `Создай ВСЕ типы связей для компании "${companyName}".

Элементы:
ТОП-МЕНЕДЖМЕНТ:
${executives.executives?.map(e => `- [${e.id}] ${e.position}`).join('\n')}

РУКОВОДИТЕЛИ:
${departmentHeads.departmentHeads?.map(h => `- [${h.id}] ${h.position}`).join('\n')}

ДЕПАРТАМЕНТЫ:
${flatDepts.map(d => `- [${d.id}] ${d.name} (${d.type})`).join('\n')}

ТИПЫ СВЯЗЕЙ:
- "manages" - руководит (руководитель → департамент)
- "reports_to" - подчиняется (подчинённый → руководитель)
- "collaborates" - сотрудничает (двустороннее между департаментами)
- "approves" - согласовывает (департамент → другой департамент)
- "consults" - консультирует (эксперт → другие)
- "supports" - обеспечивает (IT/АХО → все)

Создай ВСЕ логичные связи:
1. Иерархия подчинения (reports_to)
2. Управление департаментами (manages)
3. Межотдельное взаимодействие (collaborates)
4. Согласование (approves) - например финансы согласовывают закупки
5. Консультации (consults) - юристы консультируют всех
6. Поддержка (supports) - IT поддерживает всех

Ответь JSON:
{
  "connections": [
    {
      "from": "id элемента",
      "to": "id элемента",
      "type": "manages/reports_to/collaborates/approves/consults/supports",
      "description": "описание связи"
    }
  ],
  "statusMessage": "сообщение (до 40 символов)"
}`;

  return await callGPT(prompt, 4000);
}

/**
 * STEP 7: Validate structure integrity
 */
async function step7_validateStructure(companyName, executives, departmentHeads, departments, workers, connections) {
  // Count statistics
  const deptCount = departments.departments?.length || 0;
  const headCount = departmentHeads.departmentHeads?.length || 0;
  const execCount = executives.executives?.length || 0;
  let workerCount = 0;
  workers.departmentWorkers?.forEach(dw => {
    workerCount += dw.workers?.length || 0;
  });
  const connCount = connections.connections?.length || 0;

  // Find departments without heads
  const flatDepts = [];
  const flatten = (depts) => {
    depts?.forEach(d => {
      flatDepts.push(d.id);
      if (d.subdepartments) flatten(d.subdepartments);
    });
  };
  flatten(departments.departments);

  const managedDepts = new Set();
  departmentHeads.headToDeptConnections?.forEach(c => managedDepts.add(c.departmentId));
  const unmanagedDepts = flatDepts.filter(id => !managedDepts.has(id));

  // Find departments without workers
  const deptsWithWorkers = new Set(workers.departmentWorkers?.map(dw => dw.departmentId) || []);
  const deptsWithoutWorkers = flatDepts.filter(id => !deptsWithWorkers.has(id));

  const prompt = `Проверь организационную структуру компании "${companyName}".

СТАТИСТИКА:
- Топ-менеджеров: ${execCount}
- Руководителей отделов: ${headCount}
- Департаментов: ${flatDepts.length}
- Сотрудников: ${workerCount}
- Связей: ${connCount}

ПРОБЛЕМЫ:
${unmanagedDepts.length > 0 ? `- Департаменты БЕЗ руководителя: ${unmanagedDepts.join(', ')}` : '- Все департаменты имеют руководителей ✓'}
${deptsWithoutWorkers.length > 0 ? `- Департаменты БЕЗ сотрудников: ${deptsWithoutWorkers.join(', ')}` : '- Все департаменты имеют сотрудников ✓'}

Проверь:
1. Каждый департамент имеет руководителя (через связь manages)
2. Каждый департамент имеет сотрудников
3. Все сотрудники имеют reportsTo
4. Структура логична и полна

Ответь JSON:
{
  "isValid": true/false,
  "issues": ["список проблем"],
  "fixes": {
    "missingHeads": [
      {
        "departmentId": "id",
        "newHead": {
          "id": "head_new",
          "name": "Имя Фамилия",
          "position": "Должность",
          "responsibilities": ["..."],
          "reportsTo": "exec_id"
        }
      }
    ],
    "missingWorkers": [
      {
        "departmentId": "id",
        "workers": [
          {
            "id": "worker_new",
            "name": "Имя Фамилия",
            "position": "Должность",
            "level": "lead/senior/middle",
            "responsibilities": ["..."],
            "reportsTo": "head_id"
          }
        ]
      }
    ],
    "missingConnections": []
  },
  "summary": "итоговая оценка структуры",
  "statusMessage": "финальное сообщение (до 40 символов)"
}`;

  return await callGPT(prompt, 4000);
}

/**
 * Планирование плавающих шагов: нейросеть выбирает, какие шаги и в каком порядке выполнять.
 * Фиксированы только: Анализ (уже сделан), Связи, Проверка.
 * Плавающие: executives, departments, department_heads, workers — могут быть подмножество, свой порядок и названия.
 */
async function step_planSteps(companyName, analysis) {
  const userClarificationBlock = analysis.userClarification
    ? `\nУточнение от пользователя (обязательно учесть): ${analysis.userClarification}\n`
    : '';
  const prompt = `На основе анализа компании определи, какие промежуточные шаги нужны для построения оргструктуры.

Название: ${companyName}
Анализ: ${analysis.companySize}, ~${analysis.estimatedEmployees} чел., департаменты: ${(analysis.requiredDepartments || []).join(', ') || '—'}${userClarificationBlock}

Доступные типы шагов (id и пример названия):
- executives — топ/руководство (например "Топ-менеджмент", "Руководство")
- departments — подразделения (например "Департаменты", "Услуги")
- department_heads — руководители отделов (например "Руководители")
- workers — сотрудники (например "Сотрудники", "Мастера", "Команда")

Выбери ОПТИМАЛЬНЫЙ набор и порядок шагов под размер и тип компании. Можно использовать подмножество и свои короткие названия (label). Для микро-бизнеса достаточно 1–2 шагов (например только departments и workers). Для среднего/крупного — полный набор в логичном порядке.

Ответь JSON:
{
  "steps": [
    { "id": "executives", "label": "Топ-менеджмент" },
    { "id": "departments", "label": "Департаменты" },
    { "id": "department_heads", "label": "Руководители" },
    { "id": "workers", "label": "Сотрудники" }
  ]
}`;

  const result = await callGPT(prompt, 1500);
  const steps = result.steps || [];
  const order = ['executives', 'departments', 'department_heads', 'workers'];
  const sorted = steps
    .filter(s => order.includes(s.id))
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return { steps: sorted };
}

/**
 * Parse approximate number of employees from user text (e.g. "2 сотрудника", "3 человека").
 */
function parseEstimatedEmployeesFromText(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  // "2 сотрудника", "3 человека", "5 людей", "2 работника", "будет 2 сотрудника"
  const m = trimmed.match(/(\d+)\s*(?:сотрудник|человек|людей|работник|штат|сотр\.?)/iu)
    || trimmed.match(/(?:будет|всего|именно)\s*(\d+)/iu)
    || trimmed.match(/^(\d+)\s*$/);
  if (m) {
    const n = parseInt(m[1], 10);
    return n >= 1 && n <= 200 ? n : null;
  }
  return null;
}

/**
 * Apply user clarification choice to analysis (simplify / expand / keep / custom).
 */
function applyClarificationChoice(analysis, choice) {
  if (choice === 'keep' || !choice) return analysis;
  if (choice === 'custom') return analysis; // только userClarification, анализ не меняем
  if (choice === 'simplify') {
    return {
      ...analysis,
      companySize: 'микро',
      estimatedEmployees: Math.min(8, Math.max(3, analysis.estimatedEmployees || 5)),
      requiredDepartments: ['Услуги'],
      requiredCLevelRoles: ['Владелец'],
      structureType: 'линейная'
    };
  }
  if (choice === 'expand') {
    return {
      ...analysis,
      companySize: analysis.companySize === 'микро' ? 'малый' : analysis.companySize,
      estimatedEmployees: Math.max(analysis.estimatedEmployees || 5, 15),
      requiredDepartments: analysis.requiredDepartments?.length ? analysis.requiredDepartments : ['Услуги', 'Финансы', 'HR'],
      requiredCLevelRoles: analysis.requiredCLevelRoles?.length ? analysis.requiredCLevelRoles : ['CEO', 'CFO']
    };
  }
  return analysis;
}

const ABORT_MESSAGE = 'Генерация остановлена пользователем';

const STEP_IDS = ['executives', 'departments', 'department_heads', 'workers'];

export async function generateCompanyStructure(companyName, description, onProgress, onClarification, getAborted, onStepsPlan) {
  console.log(`🤖 Starting generation for: ${companyName}`);
  
  const checkAborted = () => {
    if (getAborted?.()) throw new Error(ABORT_MESSAGE);
  };

  try {
    // === ФИКСИРОВАННЫЙ ШАГ 1: Анализ ===
    checkAborted();
    onProgress?.({ stepIndex: 1, totalSteps: 0, stepLabel: 'Анализ', message: 'Анализирую компанию...' });
    let analysis = await step1_analyzeCompany(companyName, description);
    checkAborted();
    console.log(`📊 Анализ: ${analysis.companySize}, ${analysis.industry}, ${analysis.structureType}`);

    // Уточнение у пользователя (масштаб структуры + ручной текст)
    if (onClarification) {
      const summary = `${analysis.companySize}, ~${analysis.estimatedEmployees} чел., департаменты: ${(analysis.requiredDepartments || []).join(', ') || '—'}`;
      const result = await onClarification({
        step: 1,
        question: 'Подтвердите или скорректируйте масштаб структуры',
        summary,
        options: [
          { id: 'keep', label: 'Оставить как есть', description: summary },
          { id: 'simplify', label: 'Упростить', description: '1 департамент, 3–5 человек (например барбершоп)' },
          { id: 'expand', label: 'Расширить', description: 'Больше департаментов и ролей' },
          { id: 'custom', label: 'Использовать только моё описание', description: 'Учесть только текст выше, без смены масштаба' }
        ]
      });
      checkAborted();
      const choice = typeof result === 'object' ? (result.choice || 'keep') : result;
      const customText = typeof result === 'object' ? (result.customText || '') : '';
      const customTrimmed = customText && typeof customText === 'string' ? customText.trim() : '';
      analysis = applyClarificationChoice(analysis, choice);
      if (customTrimmed) {
        analysis.userClarification = customTrimmed;
        const parsedCount = parseEstimatedEmployeesFromText(customTrimmed);
        if (parsedCount != null) {
          analysis.estimatedEmployees = parsedCount;
          if (choice === 'simplify' && parsedCount <= 2) {
            analysis.requiredDepartments = ['Услуги'];
            analysis.requiredCLevelRoles = ['Владелец'];
          }
          if (choice === 'custom' && parsedCount <= 5) {
            analysis.companySize = 'микро';
            analysis.requiredDepartments = ['Услуги'];
            analysis.requiredCLevelRoles = ['Владелец'];
            analysis.structureType = 'линейная';
          }
          console.log(`📊 Учтено число сотрудников из уточнения: ${parsedCount}`);
        }
      }
      onProgress?.({ stepIndex: 1, totalSteps: 0, stepLabel: 'Анализ', message: 'Масштаб учтён...' });
    }

    // === ПЛАНИРОВАНИЕ ПЛАВАЮЩИХ ШАГОВ ===
    checkAborted();
    const plan = await step_planSteps(companyName, analysis);
    const plannedSteps = plan.steps || [];
    const totalSteps = 1 + plannedSteps.length + 2; // Анализ + плавающие + Связи + Проверка
    onStepsPlan?.({ steps: plannedSteps, totalSteps });
    onProgress?.({ stepIndex: 1, totalSteps, stepLabel: 'Анализ', message: 'План шагов готов...' });

    const plannedIds = plannedSteps.map(s => s.id);
    let executives = null;
    let departments = null;
    let departmentHeads = { departmentHeads: [], headToDeptConnections: [] };
    let workers = { departmentWorkers: [] };

    // Дефолты для пропущенных шагов (чтобы связи и проверка работали)
    if (!plannedIds.includes('executives')) {
      checkAborted();
      executives = await step2_createTopManagement(companyName, analysis);
      console.log(`👔 Дефолт: 1 executive`);
    }
    if (!plannedIds.includes('departments')) {
      checkAborted();
      departments = await step3_createDepartments(companyName, analysis, executives || { executives: [] });
      console.log(`🏢 Дефолт: 1 department`);
    }

    // === ПЛАВАЮЩИЕ ШАГИ ===
    for (let i = 0; i < plannedSteps.length; i++) {
      checkAborted();
      const step = plannedSteps[i];
      const stepIndex = 2 + i;
      onProgress?.({ stepIndex, totalSteps, stepLabel: step.label, message: `${step.label}...` });

      if (step.id === 'executives') {
        executives = await step2_createTopManagement(companyName, analysis);
        console.log(`👔 ${step.label}: ${executives.executives?.length || 0}`);
      } else if (step.id === 'departments') {
        departments = await step3_createDepartments(companyName, analysis, executives || { executives: [] });
        console.log(`🏢 ${step.label}: ${departments.departments?.length || 0}`);
      } else if (step.id === 'department_heads') {
        departmentHeads = await step4_createDepartmentHeads(companyName, analysis, executives || { executives: [] }, departments || { departments: [] });
        console.log(`👤 ${step.label}: ${departmentHeads.departmentHeads?.length || 0}`);
      } else if (step.id === 'workers') {
        workers = await step5_createWorkers(companyName, analysis, departments || { departments: [] });
        console.log(`👥 ${step.label}: ${workers.departmentWorkers?.length || 0} depts`);
      }
    }

    // Дефолты, если шаги не планировались
    if (!executives) executives = await step2_createTopManagement(companyName, analysis);
    if (!departments) departments = await step3_createDepartments(companyName, analysis, executives);

    // === ФИКСИРОВАННЫЙ ШАГ: Связи ===
    checkAborted();
    const connectionsIndex = totalSteps - 2;
    onProgress?.({ stepIndex: connectionsIndex, totalSteps, stepLabel: 'Связи', message: 'Выстраиваю связи...' });
    const connections = await step6_createConnections(companyName, executives, departmentHeads, departments);
    checkAborted();
    console.log(`🔗 Связи: ${connections.connections?.length || 0}`);

    // === ФИКСИРОВАННЫЙ ШАГ: Проверка ===
    checkAborted();
    onProgress?.({ stepIndex: totalSteps, totalSteps, stepLabel: 'Проверка', message: 'Проверяю структуру...' });
    const validation = await step7_validateStructure(companyName, executives, departmentHeads, departments, workers, connections);
    onProgress?.({ stepIndex: totalSteps, totalSteps, stepLabel: 'Проверка', message: validation.statusMessage || 'Готово!' });
    console.log(`✅ Проверка: ${validation.isValid ? 'PASSED' : 'needs fixes'}`);

    return {
      analysis,
      executives,
      departments,
      departmentHeads,
      workers,
      connections,
      validation
    };
    
  } catch (error) {
    console.error('❌ Generation error:', error);
    throw error;
  }
}

/**
 * Convert 7-step GPT response to flowchart elements
 */
export function convertToFlowchartElements(structure, companyName, companyDescription) {
  const elements = [];
  const connections = [];
  let elementIndex = 0;
  
  const generateId = () => `element_${Date.now()}_${elementIndex++}_${Math.random().toString(36).substr(2, 9)}`;
  
  const COLORS = {
    company: '#6366f1',
    executive: '#ec4899',
    head: '#f59e0b',
    department: '#3b82f6',
    worker: '#22c55e'
  };

  const idMap = new Map();
  
  // 1. ROOT COMPANY
  const rootId = generateId();
  elements.push({
    id: rootId,
    type: 'department',
    name: companyName,
    description: companyDescription || structure.analysis?.businessType || '',
    position: { x: 0, y: 0 },
    color: COLORS.company,
    parentId: null,
    depth: 0,
    properties: {
      head: structure.executives?.executives?.[0]?.name || '',
      location: '',
      budget: 0
    }
  });
  
  // 2. TOP MANAGEMENT (executives on company level)
  structure.executives?.executives?.forEach((exec, index) => {
    const execId = generateId();
    idMap.set(exec.id, execId);
    
    // Format detailed description
    const descParts = [];
    if (exec.responsibilities?.length) {
      descParts.push('📋 Обязанности:\n• ' + exec.responsibilities.join('\n• '));
    }
    if (exec.kpis?.length) {
      descParts.push('\n\n📊 KPI:\n• ' + exec.kpis.join('\n• '));
    }
    if (exec.authorities?.length) {
      descParts.push('\n\n🔑 Полномочия:\n• ' + exec.authorities.join('\n• '));
    }
    
    elements.push({
      id: execId,
      type: 'worker',
      name: exec.name,
      description: descParts.join('') || exec.responsibilities?.join(', ') || '',
      position: { x: -300 + index * 200, y: 0 },
      color: COLORS.executive,
      parentId: rootId,
      depth: 1,
      properties: {
        position: exec.position,
        level: exec.level,
        responsibilities: exec.responsibilities || [],
        kpis: exec.kpis || [],
        authorities: exec.authorities || [],
        email: '',
        phone: ''
      }
    });
  });
  
  // 3. DEPARTMENTS (on company level)
  const processDepartments = (depts, parentId, level, startX = 0) => {
    if (!depts) return;
    
    const spacing = 250;
    depts.forEach((dept, index) => {
      const deptId = generateId();
      idMap.set(dept.id, deptId);
      
      const x = startX + (index - (depts.length - 1) / 2) * spacing;
      
      // Format detailed description
      const descParts = [];
      if (dept.mission) {
        descParts.push('🎯 Миссия: ' + dept.mission);
      }
      if (dept.description) {
        descParts.push('\n\n' + dept.description);
      }
      if (dept.functions?.length) {
        descParts.push('\n\n📋 Функции:\n• ' + dept.functions.join('\n• '));
      }
      if (dept.kpis?.length) {
        descParts.push('\n\n📊 KPI:\n• ' + dept.kpis.join('\n• '));
      }
      if (dept.interactsWith?.length) {
        descParts.push('\n\n🤝 Взаимодействует с: ' + dept.interactsWith.join(', '));
      }
      
      elements.push({
        id: deptId,
        type: 'department',
        name: dept.name,
        description: descParts.join('') || dept.description || '',
        position: { x, y: 0 },
        color: COLORS.department,
        parentId,
        depth: level,
        properties: {
          head: '',
          departmentType: dept.type,
          mission: dept.mission || '',
          functions: dept.functions || [],
          kpis: dept.kpis || [],
          interactsWith: dept.interactsWith || [],
          location: '',
          budget: 0
        }
      });
      
      if (dept.subdepartments) {
        processDepartments(dept.subdepartments, deptId, level + 1, x);
      }
    });
  };
  processDepartments(structure.departments?.departments, rootId, 1);
  
  // 4. DEPARTMENT HEADS (on company level, linked to departments)
  structure.departmentHeads?.departmentHeads?.forEach((head, index) => {
    const headId = generateId();
    idMap.set(head.id, headId);
    
    // Format detailed description
    const descParts = [];
    if (head.responsibilities?.length) {
      descParts.push('📋 Обязанности:\n• ' + head.responsibilities.join('\n• '));
    }
    if (head.kpis?.length) {
      descParts.push('\n\n📊 KPI:\n• ' + head.kpis.join('\n• '));
    }
    if (head.authorities?.length) {
      descParts.push('\n\n🔑 Полномочия:\n• ' + head.authorities.join('\n• '));
    }
    if (head.managedDepartments?.length) {
      descParts.push('\n\n🏢 Управляет: ' + head.managedDepartments.join(', '));
    }
    
    elements.push({
      id: headId,
      type: 'worker',
      name: head.name,
      description: descParts.join('') || head.responsibilities?.join(', ') || '',
      position: { x: 300 + index * 180, y: 0 },
      color: COLORS.head,
      parentId: rootId,
      depth: 1,
      properties: {
        position: head.position,
        level: head.level,
        responsibilities: head.responsibilities || [],
        kpis: head.kpis || [],
        authorities: head.authorities || [],
        managedDepartments: head.managedDepartments || [],
        email: '',
        phone: ''
      }
    });
  });
  
  // 5. WORKERS (inside departments)
  structure.workers?.departmentWorkers?.forEach(deptWorkers => {
    const deptElementId = idMap.get(deptWorkers.departmentId);
    if (!deptElementId) return;
    
    deptWorkers.workers?.forEach((worker, wIndex) => {
      const workerId = generateId();
      idMap.set(worker.id, workerId);
      
      // Format detailed description
      const descParts = [];
      if (worker.responsibilities?.length) {
        descParts.push('📋 Обязанности:\n• ' + worker.responsibilities.join('\n• '));
      }
      if (worker.competencies?.length) {
        descParts.push('\n\n💡 Компетенции:\n• ' + worker.competencies.join('\n• '));
      }
      if (worker.kpis?.length) {
        descParts.push('\n\n📊 KPI:\n• ' + worker.kpis.join('\n• '));
      }
      if (worker.authorities?.length) {
        descParts.push('\n\n🔑 Полномочия:\n• ' + worker.authorities.join('\n• '));
      }
      
      elements.push({
        id: workerId,
        type: 'worker',
        name: worker.name,
        description: descParts.join('') || worker.responsibilities?.join(', ') || '',
        position: { x: (wIndex - (deptWorkers.workers.length - 1) / 2) * 140, y: 0 },
        color: COLORS.worker,
        parentId: deptElementId,
        depth: 2,
        properties: {
          position: worker.position,
          level: worker.level,
          responsibilities: worker.responsibilities || [],
          competencies: worker.competencies || [],
          kpis: worker.kpis || [],
          authorities: worker.authorities || [],
          email: '',
          phone: ''
        }
      });
    });
  });
  
  // 6. Apply validation fixes
  if (structure.validation?.fixes) {
    // Add missing heads
    structure.validation.fixes.missingHeads?.forEach(fix => {
      const headId = generateId();
      idMap.set(fix.newHead.id, headId);
      
      elements.push({
        id: headId,
        type: 'worker',
        name: fix.newHead.name,
        description: fix.newHead.responsibilities?.join(', ') || '',
        position: { x: 0, y: 0 },
        color: COLORS.head,
        parentId: rootId,
        depth: 1,
        properties: {
          position: fix.newHead.position,
          level: 'head',
          email: '',
          phone: ''
        }
      });
      
      // Connection head -> department
      const deptElementId = idMap.get(fix.departmentId);
      if (deptElementId) {
        connections.push({
          id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          from: headId,
          to: deptElementId,
          direction: 'outgoing',
          type: 'manages',
          description: 'Руководит'
        });
      }
    });
    
    // Add missing workers
    structure.validation.fixes.missingWorkers?.forEach(fix => {
      const deptElementId = idMap.get(fix.departmentId);
      if (!deptElementId) return;
      
      fix.workers?.forEach((worker, wIndex) => {
        const workerId = generateId();
        idMap.set(worker.id, workerId);
        
        elements.push({
          id: workerId,
          type: 'worker',
          name: worker.name,
          description: worker.responsibilities?.join(', ') || '',
          position: { x: wIndex * 140, y: 0 },
          color: COLORS.worker,
          parentId: deptElementId,
          depth: 2,
          properties: {
            position: worker.position,
            level: worker.level,
            email: '',
            phone: ''
          }
        });
      });
    });
  }
  
  // 7. HEAD TO DEPARTMENT CONNECTIONS
  structure.departmentHeads?.headToDeptConnections?.forEach(conn => {
    const fromId = idMap.get(conn.headId);
    const toId = idMap.get(conn.departmentId);
    
    if (fromId && toId) {
      connections.push({
        id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        from: fromId,
        to: toId,
        direction: 'outgoing',
        type: conn.connectionType || 'manages',
        description: conn.description || 'Руководит'
      });
    }
  });
  
  // 8. ALL OTHER CONNECTIONS
  structure.connections?.connections?.forEach(conn => {
    const fromId = idMap.get(conn.from);
    const toId = idMap.get(conn.to);
    
    if (fromId && toId) {
      // Determine direction based on type
      let direction = 'bidirectional';
      if (conn.type === 'manages' || conn.type === 'approves' || conn.type === 'supports') {
        direction = 'outgoing';
      } else if (conn.type === 'reports_to') {
        direction = 'outgoing'; // from subordinate to boss
      }
      
      connections.push({
        id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        from: fromId,
        to: toId,
        direction,
        type: conn.type || 'collaborates',
        description: conn.description || ''
      });
    }
  });

  console.log(`📦 Created: ${elements.length} elements, ${connections.length} connections`);

  return { elements, connections };
}

/**
 * Decompose a task into subtasks using GPT
 * Called when a task is assigned to a child department
 */
export async function decomposeTask(task, departmentContext = {}) {
  console.log(`🔄 Decomposing task: "${task.title}"`);
  
  const prompt = `Декомпозируй задачу на подзадачи для назначенного департамента.

ЗАДАЧА:
- Название: ${task.title}
- Описание: ${task.description || 'Не указано'}
- Приоритет: ${task.priority || 'medium'}
- Оценка времени: ${task.estimated_hours ? task.estimated_hours + ' часов' : 'Не указано'}
- Дедлайн: ${task.due_date || 'Не указан'}

КОНТЕКСТ ДЕПАРТАМЕНТА:
${departmentContext.departmentName ? `- Название: ${departmentContext.departmentName}` : ''}
${departmentContext.departmentFunctions ? `- Функции: ${departmentContext.departmentFunctions.join(', ')}` : ''}
${departmentContext.availableWorkers ? `- Доступные работники: ${departmentContext.availableWorkers.map(w => w.name + ' (' + w.position + ')').join(', ')}` : ''}
${departmentContext.childDepartments ? `- Дочерние департаменты: ${departmentContext.childDepartments.map(d => d.name).join(', ')}` : ''}

ПРАВИЛА ДЕКОМПОЗИЦИИ:
1. Разбей задачу на 3-7 логических подзадач
2. Каждая подзадача должна быть конкретной и измеримой
3. Подзадачи должны покрывать всю исходную задачу
4. Укажи примерное время выполнения для каждой подзадачи
5. Определи приоритет каждой подзадачи
6. Если задача простая - верни пустой массив подзадач

Ответь JSON:
{
  "analysis": {
    "complexity": "simple/medium/complex",
    "decompositionNeeded": true/false,
    "reasoning": "почему нужна/не нужна декомпозиция"
  },
  "subtasks": [
    {
      "title": "Название подзадачи",
      "description": "Описание того, что нужно сделать",
      "priority": "low/medium/high/critical",
      "estimatedHours": число,
      "suggestedAssigneeType": "worker/department",
      "suggestedAssigneeRole": "какая роль/компетенция нужна"
    }
  ],
  "dependencies": [
    {
      "from": 0,
      "to": 1,
      "type": "blocks/requires"
    }
  ],
  "totalEstimatedHours": число,
  "recommendations": "общие рекомендации по выполнению"
}`;

  try {
    const result = await callGPT(prompt, 3000);
    
    // Don't return subtasks if decomposition is not needed
    if (!result.analysis?.decompositionNeeded) {
      return { analysis: result.analysis, subtasks: [], recommendations: result.recommendations };
    }
    
    console.log(`✅ Task decomposed into ${result.subtasks?.length || 0} subtasks`);
    return result;
    
  } catch (error) {
    console.error('❌ Task decomposition error:', error);
    throw error;
  }
}

/**
 * Suggest the best assignee for a task using GPT
 */
export async function suggestAssignee(task, availableWorkers = [], childDepartments = []) {
  console.log(`🎯 Suggesting assignee for task: "${task.title}"`);
  
  if (availableWorkers.length === 0 && childDepartments.length === 0) {
    return { suggestion: null, message: 'Нет доступных исполнителей' };
  }

  const prompt = `Рекомендуй лучшего исполнителя для задачи.

ЗАДАЧА:
- Название: ${task.title}
- Описание: ${task.description || 'Не указано'}
- Приоритет: ${task.priority || 'medium'}
- Оценка времени: ${task.estimated_hours ? task.estimated_hours + ' часов' : 'Не указано'}

ДОСТУПНЫЕ РАБОТНИКИ:
${availableWorkers.length > 0 ? availableWorkers.map((w, i) => `${i + 1}. [${w.id}] ${w.name}
   - Должность: ${w.position || 'Не указана'}
   - Компетенции: ${w.competencies?.join(', ') || 'Не указаны'}
   - Текущая загрузка: ${w.currentTasksCount || 0} задач`).join('\n') : 'Нет доступных работников'}

ДОЧЕРНИЕ ДЕПАРТАМЕНТЫ:
${childDepartments.length > 0 ? childDepartments.map((d, i) => `${i + 1}. [${d.id}] ${d.name}
   - Функции: ${d.functions?.slice(0, 3).join(', ') || 'Не указаны'}`).join('\n') : 'Нет дочерних департаментов'}

Выбери наиболее подходящего исполнителя на основе:
1. Соответствия компетенций задаче
2. Текущей загрузки (предпочтение менее загруженным)
3. Уровня сложности задачи vs опыта исполнителя

Ответь JSON:
{
  "suggestion": {
    "type": "worker/department",
    "id": "id исполнителя",
    "name": "имя исполнителя",
    "confidence": 0.0-1.0,
    "reasoning": "почему этот исполнитель лучше всего подходит"
  },
  "alternatives": [
    {
      "type": "worker/department",
      "id": "id",
      "name": "имя",
      "confidence": 0.0-1.0,
      "reasoning": "краткое пояснение"
    }
  ],
  "recommendations": "дополнительные рекомендации"
}`;

  try {
    const result = await callGPT(prompt, 2000);
    console.log(`✅ Suggested assignee: ${result.suggestion?.name || 'none'}`);
    return result;
    
  } catch (error) {
    console.error('❌ Assignee suggestion error:', error);
    throw error;
  }
}

export default { generateCompanyStructure, convertToFlowchartElements, decomposeTask, suggestAssignee };
