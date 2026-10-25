# Aiternitas

AI-платформа управления задачами: React + Vite фронтенд, микросервисный Node.js бэкенд с real-time (Socket.IO), очередями (RabbitMQ) и локальной LLM-оркестрацией (Ollama).

## Архитектура

```
Client (Vite :3000)
   │  HTTP /api/*  +  WebSocket /socket.io
   ▼
Gateway (:3001)  ── проксирует ──►  UserServer (:4002)  [auth, users, Socket.IO hub, PostgreSQL]
   │
   ├──► AiServer (:4003)          [LLM-эндпоинты поверх Ollama + RabbitMQ-консьюмер]
   ├──► DepServer (:4004)         [TaskOrchestrator — маршрутизация задач через LLM]
   ├──► WorkerServer (:4005)      [WorkerAgent — исполнение задач в Docker-песочнице]
   ├──► SandboxServer (:4006)     [заглушка]
   └──► IntegrationServer (:4007) [заглушка]

Инфраструктура (Docker): PostgreSQL :5432, RabbitMQ :5672 (UI :15672), Redis :6379
Ollama (локально) :11434
```

### Поток оркестрации задач
```
tasks(status='pending') → DepServer опрашивает БД каждые 10с
  → LLM выбирает/создаёт департамент и работника
  → публикация в RabbitMQ (tasks_queue)
  → WorkerServer consumes → WorkerAgent (цикл инструментов)
  → обновление статусов: pending → in_progress → completed
```

---

## 1. Требования (Prerequisites)

| Инструмент | Версия | Зачем |
|---|---|---|
| Node.js | 18+ (проверено на 20.19) | рантайм серверов и сборки клиента |
| npm | 9+ | установка зависимостей (monorepo workspaces) |
| Docker Desktop | — | PostgreSQL, RabbitMQ, Redis, песочница |
| Ollama | — | локальная LLM для оркестрации и агентов |
| PowerShell | — | скрипты запуска на Windows |

---

## 2. Установка зависимостей

Проект — **npm workspaces monorepo**. Зависимости ставятся один раз в корневой `node_modules` и хоистятся для `client` и всех `microservices/*`.

```powershell
cd C:\Users\evg\WebstormProjects\aiternitas
npm install
```

> Проверка: после установки в `node_modules` должны появиться `react`, `vite`, `express`, `socket.io`, `pg`, `amqplib`, `http-proxy-middleware` — этого достаточно для всех сервисов.

---

## 3. Переменные окружения (.env)

В репозитории **нет `.env`** и нет `.env.example` — его нужно создать вручную в **коре** проекта. Все микросервисы грузят именно корневой `.env`.

Создайте файл `./.env`:

```dotenv
# ВАЖНО: PORT намеренно НЕ задан глобально —
# UserServer по умолчанию 4002, Gateway 3001. Общий PORT их столкнёт.

# --- Frontend ---
FRONTEND_URL=http://localhost:3000

# --- PostgreSQL ---
DB_HOST=localhost
DB_PORT=5432
DB_NAME=aiternitas
DB_USER=postgres
DB_PASSWORD=postgres

# --- Session / Auth ---
SESSION_SECRET=dev-session-secret
JWT_SECRET=dev-jwt-secret

# --- RabbitMQ ---
RABBITMQ_URL=amqp://aiternitas:aiternitassecret@localhost:5672

# --- Redis ---
REDIS_URL=redis://localhost:6379

# --- Ollama / AI ---
OLLAMA_URL=http://localhost:11434
AI_SERVER_URL=http://localhost:4003
AI_MODEL=llama3:latest
```

Креды PostgreSQL/RabbitMQ выше должны совпадать с контейнерами (см. шаг 4).

---

## 4. Инфраструктура (Docker)

### 4.1 Docker Desktop
```powershell
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
# дождаться готовности демона:
docker info
```

### 4.2 RabbitMQ + Redis
Определены в `docker-compose.infrastructure.yml` (пользователь/пароль `aiternitas` / `aiternitassecret`):
```powershell
docker compose -f docker-compose.infrastructure.yml up -d
```
Дадутся контейнеры `aiternitas-rabbitmq` (AMQP 5672, UI 15672) и `aiternitas-redis` (6379).

### 4.3 PostgreSQL (контейнер `task-management-postgres`)
Этот контейнер **не описан ни в одном compose-файле** — его нужно создать (или запустить, если он уже существует из прошлых сессий):

```powershell
# Если контейнер уже есть (в т.ч. остановлен):
docker start task-management-postgres

# Если его НЕТ — создать один раз:
docker run -d --name task-management-postgres `
  -e POSTGRES_USER=postgres `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=task_management `
  -p 5432:5432 `
  postgres:16-alpine
```

> Таблицы (`users`, `session`, `tasks`, `elements`, `emails`, `flowcharts`, `task_comments` и др.) и база `aiternitas` создаются **автоматически** при старте UserServer (функция `initDatabase`). Вручную ничего делать не нужно.

### 4.4 образ песочницы (опционально, для WorkerAgent)
```powershell
# Проверить наличие:
docker images aiternitas-sandbox:latest
# Построить при необходимости:
docker build -t aiternitas-sandbox:latest microservices/sandboxServer/docker
```

### 4.5 Ollama + модель
```powershell
# Оllama обычно стартует как сервис; проверить:
ollama list
# Нужна модель llama3:latest (её используют DepServer/WorkerServer):
ollama pull llama3:latest
```
Проверка HTTP-API: `Invoke-WebRequest http://localhost:11434/api/tags` → 200.

---

## 5. Запуск сервисов

⚠️ **Корневые скрипты сломаны** и не отражают текущую структуру:
- `npm start` ссылается на несуществующую папку `server` (`--prefix server`);
- `start.ps1` собирает песочницу из `server/docker` и вызывает тот же битый `npm start`.

Поэтому запускайте сервисы напрямую. **Порядок не критичен**, но удобно сначала UserServer.

Каждый сервис — в отдельном терминале (все используют `nodemon`, т.е. автopерезапуск при правках):

```powershell
# 1. UserServer — :4002 (auth, Socket.IO, БД)
npm run dev --prefix microservices/userServer

# 2. Gateway — :3001 (API + WS-прокси)
npm run dev --prefix microservices/gatewayServer

# 3. AiServer — :4003 (LLM HTTP + RabbitMQ-консьюмер)
npm run dev --prefix microservices/aiServer

# 4. DepServer — :4004 (TaskOrchestrator)
npm run dev --prefix microservices/depServer

# 5. WorkerServer — :4005 (WorkerAgent-пул)
npm run dev --prefix microservices/workerServer

# 6. SandboxServer — :4006 (заглушка)
npm run dev --prefix microservices/sandboxServer

# 7. IntegrationServer — :4007 (заглушка)
npm run dev --prefix microservices/integrationServer

# 8. Client (Vite) — :3000
npm run dev --prefix client
```

Открыть фронтенд: **http://localhost:3000**

### Порты
| Сервис | Порт | Назначение |
|---|---|---|
| Client | 3000 | фронтенд (Vite dev) |
| Gateway | 3001 | точка входа API/WS |
| UserServer | 4002 | auth, users, Socket.IO hub |
| AiServer | 4003 | LLM-эндпоинты |
| DepServer | 4004 | оркестратор задач |
| WorkerServer | 4005 | фоновые воркеры |
| SandboxServer | 4006 | песочница (заглушка) |
| IntegrationServer | 4007 | плагины (заглушка) |
| PostgreSQL | 5432 | БД |
| RabbitMQ | 5672 / 15672 | очередь / web-UI |
| Redis | 6379 | кэш/сессии |
| Ollama | 11434 | локальная LLM |

---

## 6. Быстрая проверка запуска

```powershell
# Все сервисы отвечают?
foreach ($u in "http://localhost:3000/","http://localhost:4002/","http://localhost:4003/",`
                "http://localhost:4004/","http://localhost:4005/","http://localhost:4006/",`
                "http://localhost:4007/") {
  try { $r = Invoke-WebRequest $u -UseBasicParsing -TimeoutSec 8; "$u -> $($r.StatusCode)" }
  catch { "$u -> ERR" }
}

# Сквозной путь Gateway -> UserServer -> PostgreSQL:
Invoke-WebRequest http://localhost:3001/api/stats -UseBasicParsing | Select-Object -Expand Content

# LLM-путь AiServer -> Ollama:
Invoke-WebRequest http://localhost:4003/api/ai/generate -Method POST -ContentType 'application/json' `
  -Body '{"prompt":"Say READY","model":"llama3:latest"}' -UseBasicParsing | Select-Object -Expand Content
```

Ожидаемо: все `200`, `/api/stats` возвращает JSON со статистикой, `/api/ai/generate` — `{"response":"..."}`.

---

## 7. Тест конвейера оркестрации задач

Минимальный способ — вставить `pending`-задачу напрямую в БД и проследить за логами DepServer/WorkerServer:

```powershell
# user_id=1 должен существовать (см. SELECT id FROM users)
docker exec -i task-management-postgres psql -U postgres -d aiternitas -c "INSERT INTO tasks (user_id, department_id, title, description, priority, status) VALUES (1,'test','Тест конвейера','Оставь комментарий через add_task_comment и заверши через done.','low','pending') RETURNING id;"
```

Далее (опрос оркестратора раз в 10с + LLM-инференс) в логах видно:
```
[TaskOrchestrator] Взята в работу задача #N ...
[TaskOrchestrator] Публикация задачи #N в RabbitMQ (tasks_queue) ...
[workerServer] Получена задача: {...}
[Agent Worker] Executing tool: add_task_comment ...
[Agent Worker] Executing tool: done ...
[workerServer] Задача #N успешно обработана!
```

Проверка результата:
```powershell
docker exec -i task-management-postgres psql -U postgres -d aiternitas -c "SELECT id,status FROM tasks ORDER BY id;"
docker exec -i task-management-postgres psql -U postgres -d aiternitas -c "SELECT author_type,content FROM task_comments WHERE task_id=<N>;"
```
Успешный финал: `status = completed`.

> В UI задачи создаются штатно (через flowchart/канбан); direct INSERT — лишь способ быстро протестировать бэкенд без фронтенда.

---

## 8. Изменения, внесённые для работоспособности

При первом запуске в исходном коде не хватало рабочих элементов. Что было сделано:

1. **Создан корневой `.env`** — его вообще не было (п. 3).
2. **`microservices/aiServer/index.mjs`** — добавлен HTTP-сервер Express (порт 4003) с маршрутами `POST /api/ai/generate` и `GET /api/ai/models` поверх Ollama API. Без этого DepServer/WorkerServer не могли получить решения LLM (они вызывают `http://localhost:4003/api/ai/generate`).
3. **`microservices/workerServer/WorkerAgent.mjs`** — исправлен парсинг ответа LLM: AiServer при `requireJson` возвращает JSON-**строку**, а агент обращался к `.action` у строки → `Invalid JSON format`. Добавлен `JSON.parse`.

### Известные (не починенные) дефекты
- **`npm start` и `start.ps1`** ссылаются на несуществующую папку `server` (структура проекта не отражена в скриптах). Запускайте сервисы вручную (п. 5).
- **`WorkerAgent`**: инструменты `bash_execute` / `execute_docker` используют `require()` внутри ESM-модуля (`.mjs`) → `TOOL ERROR: require is not defined`. Требуется замена на импорты `import`.
- **AiServer RabbitMQ-консьюмер** подписан на `user.#` (дефолт `RABBITMQ_QUEUE='user'`), а не на `ai.#` — событийный путь `ai.chat.message` через консьюмер не срабатывает; HTTP-путь работает.
- **OPENAI_API_KEY** / пакет **`qrcode`** не заданы/не установлены — опциональные интеграции (OpenAI-fallback, WhatsApp/Telegram) отключены. Не блокируют запуск.

---

## 9. Остановка

- Остановить сервисы: `Ctrl+C` в каждом терминале.
- Остановить контейнеры (по желанию):
```powershell
docker stop task-management-postgres aiternitas-rabbitmq aiternitas-redis
```

---

## 10. Быстрый чек-лист запуска

- [ ] `npm install` в корне
- [ ] создан `.env` (п. 3) с кредом под контейнеры
- [ ] Docker Desktop запущен (`docker info`)
- [ ] `docker compose -f docker-compose.infrastructure.yml up -d` (RabbitMQ + Redis)
- [ ] запущен `task-management-postgres`
- [ ] `ollama list` содержит `llama3:latest`
- [ ] стартовали UserServer, Gateway, AiServer, DepServer, WorkerServer, Client
- [ ] http://localhost:3000 открывается, `/api/stats` через gateway отвечает
