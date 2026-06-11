# AGENTS.md - AI Coding Agent Guide for Aiternitas

## Project Type
**Monorepo**: Node.js/React task-management platform with microservices architecture, real-time Socket.IO communication, and AI-powered orchestration using local LLM (Ollama).

## Workspace Structure
```
aiternitas/
├── client/                    # React + Vite, Three.js 3D visualizations
├── microservices/
│   ├── userServer/           # Express (4002): Auth, users, Socket.IO hub
│   ├── aiServer/             # LLM integration (4003)
│   ├── depServer/            # Task orchestrator (4004)
│   ├── workerServer/         # Task workers w/ RabbitMQ (4005)
│   ├── gatewayServer/        # API Gateway (3001)
│   ├── integrationServer/    # External plugins (4007)
│   └── sandboxServer/        # Code execution sandbox (4006)
├── mobile_app/               # React Native
└── plugins/telegram/         # Plugin example
```

## Critical Architecture Patterns

### 1. Microservices & API Gateway
- **Gateway** (port 3001) proxies all requests to microservices with WebSocket support
- Each microservice runs independently (can develop/test individually)
- Routes in `gatewayServer/index.mjs`: map `/api/*` → specific service ports
- CORS handled at gateway, passes through to individual services

### 2. Task Orchestration Flow
```
depServer (scheduler) → LLM decides task handling → 
  RabbitMQ → workerServer (worker pool) → WorkerAgent processes
  Database updates: pending → in_progress → completed
```
- `TaskOrchestrator` in `depServer/TaskOrchestrator.mjs` polls DB every 10s for `status='pending'` tasks
- LLM (Ollama on localhost:11434) makes routing decisions (which department, which worker)
- Workers consume from `tasks_queue` via RabbitMQ/AMQP

### 3. Real-Time Communication (Socket.IO)
- **Hub**: `userServer` (4002) handles Socket.IO server + session storage
- **Gateway** proxies `/socket.io` → userServer
- **User rooms**: Connected sockets join `user:{userId}` for targeted broadcasts
- **Authentication**: Restored from HTTP session cookie (Express session in PostgreSQL)
- **Patterns**:
  - `.emit(event, data, timeoutMs)` - request/response with timeout promise
  - `.send(event, data)` - fire-and-forget (for pub/sub like sandbox events)
- Setup in `userServer/socket/index.mjs`, handlers split by feature (auth, flowchart, task, sandbox)

### 4. Database & Configuration
- **PostgreSQL** container: `task-management-postgres`
- **Root `.env`** loaded by all services via `dotenv.config({ path: path.join(__dirname, '../../.env') })`
- Key vars: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `FRONTEND_URL`, `SMTP_*`, `OPENAI_API_KEY`
- Fallback defaults: localhost:5432, user=postgres (peer auth on local)

### 5. Docker Sandbox Execution
- **Image**: `aiternitas-sandbox:latest` (built from `server/docker/Dockerfile`)
- **Mount**: Project root → `/workspace` in container
- **Pattern**: Write script → call Docker container → capture stdout/stderr
- WorkerAgent uses `bash_execute`, `write_script`, `execute_docker` tools
- Command: `docker run --rm -v "$(pwd)":/workspace -w /workspace node:18-alpine ...`

## Developer Workflows

### Initial Setup
1. `npm install` - Install root dependencies (concurrently)
2. `.\start.ps1` - PowerShell script that:
   - Starts Docker Desktop (if not running, waits 30s)
   - Checks/starts PostgreSQL container
   - Builds `aiternitas-sandbox:latest` image if missing
   - Starts Ollama service (local LLM)
   - Returns to terminal

### Running the System
```powershell
npm start
# Runs concurrently:
#   [SERVER] npm run dev --prefix microservices/userServer
#   [CLIENT] npm run dev --prefix client
# Gateway starts alongside (check individual microservice dev scripts)
```

### Individual Microservice Development
```bash
cd microservices/userServer
npm run dev          # Start with nodemon
npm run lint         # ESLint check
npm run test         # Vitest
npm run test:watch   # Watch mode
```

### Frontend Development
```bash
cd client
npm run dev          # Vite dev server (port 3000)
npm run build        # Production build
npm run build:low-mem # Low memory build (--max-old-space-size=384)
```

### Key Commands & Ports
| Service | Port | Purpose |
|---------|------|---------|
| Gateway | 3001 | API entry point |
| Client  | 3000 | Frontend Vite dev |
| UserServer | 4002 | Auth, Socket.IO |
| AiServer | 4003 | LLM endpoints |
| DepServer | 4004 | Task orchestration |
| WorkerServer | 4005 | Background workers |
| SandboxServer | 4006 | Code execution |
| IntegrationServer | 4007 | Plugins |
| PostgreSQL | 5432 | Database |
| RabbitMQ | 5672 | Message queue |
| Redis | 6379 | Cache/sessions |
| Ollama | 11434 | Local LLM |

## Project-Specific Conventions

### 1. Error Logging Pattern
- All services prefix logs: `[ServiceName]` or `[ServiceName] Feature`
- Example: `console.log('[TaskOrchestrator] Task #123 processed')`
- Console only (no separate log files), visible in terminal

### 2. JSON Response Handling
- LLM responses often wrapped in JSON; always `JSON.parse()` with fallback:
  ```javascript
  try { 
    result = typeof response === 'string' ? JSON.parse(response) : response; 
  } catch(e) { 
    result = { fallback: 'default_value' };
  }
  ```

### 3. Environment & Build Paths
- All microservices load root `.env` (not local ones)
- Module imports: `import ... from '../../path'` (two levels up to root)
- CommonJS module type: Use `.mjs` extension for ES modules

### 4. Socket.IO Event Naming
- **Namespaced**: `feature:action` (e.g., `flowchart:generate`, `sandbox:chat:response`)
- **Callback pattern**: Event listener sends ACK callback with response
- **No namespaces**: Use `socket.join('room')` directly, not `io.of(namespace)`

### 5. Database Patterns
- All services instantiate own pool: `new Pool(dbConfig)` for flexibility
- No schema migrations tracked (schema exists, check PostgreSQL logs)
- Connection pooling: `max: 20, idleTimeoutMillis: 30000`

### 6. Express & Middleware Order
- `app.set('trust proxy', 1)` MUST be first (required behind gateway)
- CORS → express.json() → express.urlencoded() → custom routes
- Example from userServer (port 4002):
  ```javascript
  app.set('trust proxy', 1);
  app.use(cors({ origin: [FRONTEND_URL, 'http://localhost:3001'], credentials: true }));
  app.use(express.json());
  // ... routes
  ```

## Critical Integration Points

### Frontend → Backend
1. **HTTP**: `/api/*` routes through gateway
2. **WebSocket**: Direct Socket.IO connection → userServer (gateway proxies)
3. **Auth**: HTTP cookie-based sessions (express-session + connect-pg-simple)
4. **Client library**: `src/services/socket.js` - singleton socketService instance

### Inter-Service Communication
1. **HTTP**: Services call each other directly (e.g., depServer calls aiServer for LLM)
2. **RabbitMQ/AMQP**: depServer publishes tasks → workerServer consumes
3. **Database**: Shared PostgreSQL (all services read/write same tables)
4. **Redis**: Cache/session storage (docker-compose.infrastructure.yml)

### External Dependencies
- **Ollama**: Local LLM on port 11434 (`http://localhost:11434`)
- **OpenAI API**: Optional, key in .env (fallback for aiServer)
- **SMTP**: Email via nodemailer (config in .env)
- **Telegram Bot API**: Via @mtproto/core and socket handlers

## Testing & Debugging

### Test Files Location & Pattern
- `package.json` has `vitest` configured but tests minimal
- Run: `npm run test` (vitest run) or `npm run test:watch`
- Test config: `vitest.config.js` in each workspace

### Debugging Microservices
- **Start one service** in isolation: `cd microservices/userServer && npm run dev`
- **Gateway must run** for `/api/*` routes to work (start separately if debugging single service)
- **Log levels**: Use prefixes `[ServiceName]` to trace flow
- **Socket.IO**: Browser DevTools → Network → WS (filter socket.io) for events

### Key Files to Inspect
- `depServer/TaskOrchestrator.mjs` - Understand task flow
- `workerServer/WorkerAgent.mjs` - Agent tool implementation
- `userServer/socket/index.mjs` - Real-time event handlers
- `client/src/services/socket.js` - Frontend Socket.IO patterns
- `gatewayServer/index.mjs` - Proxy routing & WebSocket upgrade

## Common Gotchas & Fixes

1. **WebSocket Connection Fails**: Gateway not proxying `/socket.io`
   - Check: `getProxyMiddleware` rule for `/socket.io` → `http://localhost:4002` in gatewayServer

2. **Task Orchestrator Not Running**: depServer processes but nothing happens
   - Ensure: RabbitMQ running (`docker ps | grep rabbitmq`)
   - Ensure: PostgreSQL has `tasks` table with `status` column
   - Check: `taskOrchestrator.start()` called in index.mjs

3. **Ollama Timeout**: LLM calls fail with "Cannot connect to localhost:11434"
   - Start Ollama: `./start.ps1` (or manually start `ollama serve`)
   - Pull model: `ollama pull llama3:latest` (or your configured model)

4. **Session Lost on Socket Reconnect**: Socket doesn't restore from cookie
   - Check: `setupAuthCheck()` in `userServer/socket/index.mjs`
   - Session store: PostgreSQL (connect-pg-simple table `session`)

5. **Image Not Found (aiternitas-sandbox)**: Docker command fails
   - Rebuild: `docker build -t aiternitas-sandbox:latest microservices/sandboxServer/docker` 
   - Or: Run `.\start.ps1` again

## Quick Reference: Adding New Endpoints

### New REST API Route
1. Create route file in `userServer/routes/`, export async functions
2. Import & mount in `userServer/index.mjs`: `app.use('/api/feature', featureRouter)`
3. Test via gateway: `curl http://localhost:3001/api/feature/endpoint`

### New Socket.IO Event
1. Create handler file in `userServer/socket/` (e.g., `newfeature.mjs`)
2. Call `setupNewFeatureHandlers(io, socket)` in main socket handler
3. In handler, use `socket.emit('response', data, (ack) => ...)` for callback pattern

### New Microservice
1. Create folder in `microservices/newservice/`
2. Add `index.mjs`, `config.mjs`, `package.json` (type: "module")
3. Update gateway routes in `gatewayServer/index.mjs`
4. Add port to `start` script in root package.json if needed

---

**Last Updated**: 2026-06-11  
**Language**: Russian and English (code comments mixed)  
**Node Version**: 18+ (uses ES Modules, async/await)

