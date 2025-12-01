// OpenAI service for generating company structures
// 7-step generation with hierarchy, connections, and validation
import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.warn('⚠️ OPENAI_API_KEY not found in environment variables');
} else {
  console.log('✅ OpenAI API key loaded (length:', apiKey.length, ')');
}

const openai = new OpenAI({
  apiKey: apiKey || 'missing-key'
});

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
 * STEP 1: Analyze company and determine organizational structure type
 */
async function step1_analyzeCompany(companyName, description) {
  const prompt = `Проанализируй компанию и определи оптимальную организационную структуру.

Название: ${companyName}
Описание: ${description || 'Не указано'}

Определи:
1. Тип компании по размеру
2. Отрасль и специфику бизнеса
3. Тип оргструктуры (линейная/функциональная/дивизиональная/матричная)
4. Примерное количество сотрудников
5. Необходимые уровни управления

Ответь JSON:
{
  "companySize": "стартап/малый/средний/крупный",
  "industry": "отрасль",
  "businessType": "тип бизнеса",
  "structureType": "линейная/функциональная/матричная",
  "estimatedEmployees": число,
  "managementLevels": ["C-Level", "Директора", "Руководители отделов", "Специалисты"],
  "requiredCLevelRoles": ["CEO", "другие необходимые C-Level"],
  "requiredDepartments": ["список необходимых департаментов"],
  "statusMessage": "динамическое сообщение о следующем шаге (до 40 символов)"
}`;

  return await callGPT(prompt);
}

/**
 * STEP 2: Create C-Level / Top Management (outside departments)
 */
async function step2_createTopManagement(companyName, analysis) {
  const prompt = `Создай топ-менеджмент компании "${companyName}".

Тип компании: ${analysis.companySize}
Отрасль: ${analysis.industry}
Тип структуры: ${analysis.structureType}
Рекомендуемые C-Level роли: ${analysis.requiredCLevelRoles?.join(', ')}

ВАЖНО: Топ-менеджеры размещаются НА ОДНОМ УРОВНЕ с департаментами (не внутри них).

Создай ДЕТАЛЬНОЕ описание для каждого руководителя:
- Функциональные обязанности (минимум 5-7 пунктов)
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
 * STEP 3: Create departments with classification
 */
async function step3_createDepartments(companyName, analysis, executives) {
  const prompt = `Создай департаменты компании "${companyName}".

Анализ:
- Размер: ${analysis.companySize}
- Отрасль: ${analysis.industry}
- Структура: ${analysis.structureType}
- Необходимые департаменты: ${analysis.requiredDepartments?.join(', ')}

Создай ПОДРОБНОЕ описание для каждого департамента:
- Миссия и цели департамента
- Ключевые функции (минимум 5-8 пунктов)
- Зоны ответственности
- KPI департамента
- Взаимодействие с другими отделами

Классификация:
- core (основной бизнес): производство, продажи, разработка
- support (поддержка): IT, HR, бухгалтерия, юристы
- management (управление): стратегия, качество

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
  // Flatten departments
  const flatDepts = [];
  const flatten = (depts, parentName = null) => {
    depts?.forEach(d => {
      flatDepts.push({ id: d.id, name: d.name, type: d.type, parent: parentName });
      if (d.subdepartments) flatten(d.subdepartments, d.name);
    });
  };
  flatten(departments.departments);

  const prompt = `Создай руководителей департаментов с ДЕТАЛЬНЫМИ обязанностями для "${companyName}".

Департаменты:
${flatDepts.map(d => `- [${d.id}] ${d.name} (${d.type})`).join('\n')}

Топ-менеджмент:
${executives.executives?.map(e => `- [${e.id}] ${e.position}`).join('\n')}

Для КАЖДОГО руководителя создай:
1. Функциональные обязанности (минимум 6-8 пунктов)
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
 * STEP 5: Create workers with hierarchy inside departments
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

  const prompt = `Создай сотрудников с ДЕТАЛЬНЫМИ должностными инструкциями для компании "${companyName}".

Размер компании: ${analysis.companySize}
Примерно сотрудников: ${analysis.estimatedEmployees}

Департаменты:
${flatDepts.map(d => `- [${d.id}] ${d.name}: ${d.functions?.slice(0, 3).join(', ')}`).join('\n')}

Для КАЖДОГО сотрудника создай:
1. Функциональные обязанности (минимум 5-7 пунктов)
2. Требуемые компетенции
3. KPI сотрудника
4. Права и полномочия

ИЕРАРХИЯ:
- lead: Ведущий специалист / Team Lead
- senior: Старший специалист  
- middle: Специалист
- junior: Младший специалист

Каждый департамент: минимум 3-4 сотрудника.

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
 * Main function: 7-step generation
 */
export async function generateCompanyStructure(companyName, description, onProgress) {
  console.log(`🤖 Starting 7-step generation for: ${companyName}`);
  
  try {
    // STEP 1: Analyze company
    onProgress?.({ step: 1, total: 7, message: 'Анализирую компанию...' });
    const analysis = await step1_analyzeCompany(companyName, description);
    console.log(`📊 Step 1: ${analysis.companySize}, ${analysis.industry}, ${analysis.structureType}`);
    
    // STEP 2: Create top management
    onProgress?.({ step: 2, total: 7, message: analysis.statusMessage || 'Формирую топ-менеджмент...' });
    const executives = await step2_createTopManagement(companyName, analysis);
    console.log(`👔 Step 2: ${executives.executives?.length || 0} executives created`);
    
    // STEP 3: Create departments
    onProgress?.({ step: 3, total: 7, message: executives.statusMessage || 'Создаю департаменты...' });
    const departments = await step3_createDepartments(companyName, analysis, executives);
    console.log(`🏢 Step 3: ${departments.departments?.length || 0} departments created`);
    
    // STEP 4: Create department heads
    onProgress?.({ step: 4, total: 7, message: departments.statusMessage || 'Назначаю руководителей...' });
    const departmentHeads = await step4_createDepartmentHeads(companyName, analysis, executives, departments);
    console.log(`👤 Step 4: ${departmentHeads.departmentHeads?.length || 0} heads created`);
    
    // STEP 5: Create workers
    onProgress?.({ step: 5, total: 7, message: departmentHeads.statusMessage || 'Формирую команды...' });
    const workers = await step5_createWorkers(companyName, analysis, departments);
    console.log(`👥 Step 5: Workers created for ${workers.departmentWorkers?.length || 0} departments`);
    
    // STEP 6: Create connections
    onProgress?.({ step: 6, total: 7, message: workers.statusMessage || 'Выстраиваю связи...' });
    const connections = await step6_createConnections(companyName, executives, departmentHeads, departments);
    console.log(`🔗 Step 6: ${connections.connections?.length || 0} connections created`);
    
    // STEP 7: Validate
    onProgress?.({ step: 7, total: 7, message: connections.statusMessage || 'Проверяю структуру...' });
    const validation = await step7_validateStructure(companyName, executives, departmentHeads, departments, workers, connections);
    console.log(`✅ Step 7: Validation ${validation.isValid ? 'PASSED' : 'needs fixes'}`);
    
    onProgress?.({ step: 7, total: 7, message: validation.statusMessage || 'Готово!' });
    
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
